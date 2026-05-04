/**
 * Retrieval: given a user query (and optional structured filters), return the
 * top-k Course[] that are most relevant.
 *
 * We use a hybrid approach:
 *   1) Structured filters from the question (e.g., "HASS-A only", "spring",
 *      "department=6") are applied first to constrain the candidate set.
 *   2) Semantic similarity (cosine over MiniLM embeddings) ranks remaining
 *      candidates.
 *   3) A small lexical bonus is added for exact course-id matches in the query
 *      so e.g. "Tell me about 6.1010" always returns 6.1010.
 *
 * Embeddings only exist for Course 6 / cross-listed subjects, so semantic
 * ranking falls back to BM25-lite over title+description for non-embedded
 * subjects.
 */

import "server-only";
import type { Course } from "@/lib/data/types";
import { getCourses, getEmbeddings } from "@/lib/data/store";
import { embedQuery } from "@/lib/rag/embedder";

export interface RetrievalFilters {
  /** "6", "18", etc. */
  department?: string;
  /** Restrict to a specific HASS attribute. */
  hass?: "HASS-A" | "HASS-S" | "HASS-H" | "HASS-E";
  /** Restrict to a specific CI attribute (CI-H, CI-HW, CI-M). */
  ci?: "CI-H" | "CI-HW" | "CI-M";
  /** GIR attribute (LAB, REST, ...). */
  gir?: string;
  /** Term offering filter. */
  offered?: "fall" | "spring" | "iap" | "summer";
  /** Restrict to undergraduate or graduate level. */
  level?: "U" | "G";
  /** Maximum number of results. */
  limit?: number;
  /**
   * If true, the question is asking for an exhaustive list ("all CI-M
   * classes", "every advanced subject in 6"). We return the complete filter
   * match set (capped only by a generous safety limit) instead of top-k.
   */
  listMode?: boolean;
  /**
   * If set, retrieve courses that are SIMILAR to these specific course IDs
   * (computed from the courses' own embedding vectors), instead of from the
   * raw user text. Used for questions like "what's similar to 6.3260?".
   */
  similarToCourseIds?: string[];
}

export interface Retrieved {
  course: Course;
  score: number;
  /** Why this was retrieved: 'semantic' | 'exact' | 'filter' */
  reason: "semantic" | "exact" | "filter";
}

const DEFAULT_LIMIT = 8;
const LIST_MODE_LIMIT = 80;

/**
 * Detects exact course-id mentions in the query (e.g., "6.1010" or "6.S898").
 */
function detectIdMentions(query: string): string[] {
  const re = /\b(\d{1,2})\.([0-9A-Z]{1,5})\b/g;
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    ids.add(`${m[1]}.${m[2]}`);
  }
  return [...ids];
}

function applyFilters(courses: Course[], f: RetrievalFilters): Course[] {
  return courses.filter((c) => {
    if (f.department && c.department !== f.department) return false;
    if (f.hass && c.hassAttribute !== f.hass) return false;
    if (f.ci) {
      if (f.ci === "CI-H") {
        if (
          c.communicationRequirement !== "CI-H" &&
          c.communicationRequirement !== "CI-HW"
        )
          return false;
      } else if (c.communicationRequirement !== f.ci) {
        return false;
      }
    }
    if (f.gir && c.girAttribute !== f.gir) return false;
    if (f.offered && !c.offered[f.offered]) return false;
    if (f.level && c.level !== f.level) return false;
    return true;
  });
}

function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // already normalized
}

/** Lexical fallback for courses without embeddings. */
function lexicalScore(course: Course, query: string): number {
  const q = query.toLowerCase();
  const tokens = q.split(/\W+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return 0;
  const text = `${course.title} ${course.description}`.toLowerCase();
  let hits = 0;
  for (const t of tokens) if (text.includes(t)) hits++;
  return hits / tokens.length;
}

/**
 * Retrieve top-k relevant courses for the query.
 */
export async function retrieve(
  query: string,
  filters: RetrievalFilters = {},
): Promise<Retrieved[]> {
  const courses = await getCourses();
  const filtered = applyFilters(courses, filters);
  if (filtered.length === 0) return [];

  const limit =
    filters.limit ?? (filters.listMode ? LIST_MODE_LIMIT : DEFAULT_LIMIT);

  const idMentions = detectIdMentions(query);
  const exactHits = idMentions
    .map((id) => filtered.find((c) => c.id === id))
    .filter((c): c is Course => c !== undefined);

  const exactRetrieved: Retrieved[] = exactHits.map((c) => ({
    course: c,
    score: 1.0,
    reason: "exact",
  }));

  // List-mode short-circuit: when the user asked "list all X that Y", and the
  // structured filters narrowed down a finite set, return the entire filtered
  // set sorted by id. Semantic ranking adds noise here ("show me all CI-M
  // courses" should not be sorted by similarity to the *phrasing* of the
  // question).
  if (filters.listMode && hasMeaningfulFilters(filters)) {
    const sorted = [...filtered].sort((a, b) =>
      a.id.localeCompare(b.id, undefined, { numeric: true }),
    );
    const seen = new Set<string>();
    const out: Retrieved[] = [];
    for (const c of [...exactHits, ...sorted]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({
        course: c,
        score: 1,
        reason: exactHits.includes(c) ? "exact" : "filter",
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  // Build the query vector. For "find similar to course X" requests we use
  // the average embedding of the referenced courses themselves; otherwise we
  // embed the user's text. Course-to-course similarity is dramatically more
  // accurate for "what's similar to 6.3260?" than embedding the question.
  let semantic: Retrieved[] = [];
  try {
    const emb = await getEmbeddings();
    const idIndex = new Map<string, number>();
    for (let i = 0; i < emb.ids.length; i++) idIndex.set(emb.ids[i], i);

    const dim = emb.vectors[0]?.length ?? 0;
    let qVec: number[];
    const refIds = filters.similarToCourseIds ?? [];
    const refVectors: number[][] = refIds
      .map((id) => idIndex.get(id))
      .filter((i): i is number => i !== undefined)
      .map((i) => emb.vectors[i]);

    if (refVectors.length > 0) {
      qVec = averageVectors(refVectors, dim);
    } else {
      qVec = await embedQuery(query);
    }

    semantic = filtered.map((c) => {
      // Never recommend the same course back as "similar to itself".
      if (refIds.includes(c.id)) {
        return { course: c, score: -1, reason: "filter" as const };
      }
      const i = idIndex.get(c.id);
      if (i !== undefined) {
        return {
          course: c,
          score: cosine(qVec, emb.vectors[i]),
          reason: "semantic" as const,
        };
      }
      return {
        course: c,
        score: lexicalScore(c, query) * 0.6,
        reason: "filter" as const,
      };
    });
  } catch (err) {
    console.error("[retrieve] embedding failed, falling back to lexical:", err);
    semantic = filtered.map((c) => ({
      course: c,
      score: lexicalScore(c, query),
      reason: "filter" as const,
    }));
  }

  semantic.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: Retrieved[] = [];
  for (const r of [...exactRetrieved, ...semantic]) {
    if (seen.has(r.course.id)) continue;
    seen.add(r.course.id);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

function hasMeaningfulFilters(f: RetrievalFilters): boolean {
  return Boolean(
    f.department ||
      f.hass ||
      f.ci ||
      f.gir ||
      f.offered ||
      f.level,
  );
}

function averageVectors(vectors: number[][], dim: number): number[] {
  const out = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  // Normalize so cosine similarity is well-defined on the result.
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) out[i] /= norm;
  return out;
}

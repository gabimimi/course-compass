/**
 * Generates the assistant's response based on the question category and
 * intent flags from the classifier.
 *
 *  - factual              -> grounded answer with course citations,
 *                            optionally enriched with the user's requirement
 *                            tree + progress report + joint-listing context
 *  - opinion              -> safe deflection + links to evaluation resources
 *  - personal_high_stakes -> empathetic advisor redirect
 *  - off_topic            -> polite refusal
 */

import "server-only";
import { complete, MODEL_FAST, type ChatMessage } from "@/lib/llm/anthropic";
import { extractCourseIdsFromText, type ClassificationResult } from "@/lib/llm/classifier";
import type { Course } from "@/lib/data/types";
import type { MajorRequirement, RequirementNode } from "@/lib/requirements/types";
import { retrieve, type Retrieved } from "@/lib/rag/retrieve";
import { getMajor, MAJORS, CATALOG_YEARS, type CatalogYear } from "@/lib/requirements/data";
import {
  evaluateMajor,
  type ProgressReport,
  type NodeStatus,
} from "@/lib/requirements/engine";
import { getCourses } from "@/lib/data/store";
import { getHydrantClassIdSetForTerm } from "@/lib/hydrant/fetchCatalog";
import { GROUPINGS_SOURCE_URL } from "@/lib/requirements/groupings";
import {
  CIM2_SUBJECTS,
  GROUPINGS_FALL2026_NOTE,
} from "@/lib/requirements/groupingsFall2026";
import {
  formatCourseRequirementCoverage,
  resolveCanonicalCourseId,
  resolveCourseFromMention,
} from "@/lib/requirements/courseCoverage";
import { TRACKS, TRACKS_SOURCE_URL } from "@/lib/requirements/tracks";
import { analyzeScheduleFit, meetingsOverlap } from "@/lib/schedule/conflicts";
import { buildHydrantScheduleUrl, normalizeHydrantCourseId } from "@/lib/hydrant/urlState";
import {
  formatSemesterLabel,
  parseSemesterMention,
  parseSemesterMentionWithHistory,
  resolveHydrantTermSlug,
  type CatalogSeason,
  type ResolvedHydrantTerm,
} from "@/lib/hydrant/semester";
import { CHAT_THREAD_MAX_MESSAGES } from "@/lib/chat/threadMemory";

/** One full MIT subject id (6.1010, CMS.303, 21M.365) for regex composition. */
const RE_MIT_SUBJECT_FULL =
  "(?:\\d{1,2}|[A-Za-z]{2,}[A-Za-z0-9]*|\\d+[A-Za-z][A-Za-z0-9]*)\\.[0-9A-Za-z]+";

export interface AnswerInput {
  question: string;
  classification: ClassificationResult;
  history: ChatMessage[];
  majorId?: string;
  /** Catalog year to use for requirement data (default: "2026-2027"). */
  catalogYear?: string;
  /** User's expected graduation year (for context in answers). */
  graduationYear?: number | null;
  completedCourseIds?: string[];
}

export interface AnswerCitation {
  courseId: string;
  title: string;
  url: string;
}

/** Live MIT Hydrant calendar embedded below the assistant message (same origin as hydrant.mit.edu). */
export interface ScheduleHydrantEmbedPayload {
  url: string;
}

export interface AnswerResult {
  text: string;
  citations: AnswerCitation[];
  classification: ClassificationResult;
  scheduleHydrant?: ScheduleHydrantEmbedPayload;
  /** Subjects in the Hydrant URL — persist client-side for thread memory. */
  scheduleCourseIds?: string[];
}

const ADVISOR_REDIRECT = `That's a really important question, but it's not one I should try to answer for you. Decisions about your major, career path, or personal academic experience deserve a real conversation with someone who knows you. I'd encourage you to bring this to:

- Your **academic advisor** (every student has one assigned through their department)
- An **EECS undergraduate officer** if it's program-related: <https://www.eecs.mit.edu/academics/undergraduate-programs/>
- **Student Support Services (S^3)** for personal or wellbeing concerns: <https://studentlife.mit.edu/s3>

If it would help, I can summarize the **academic facts** that might be relevant to your conversation — for example, which requirements you'd still have left under different majors, or what courses are typically taken in a given semester. Want me to pull any of that together?`;

const OPINION_DEFLECTION = `Course Compass intentionally doesn't answer subjective questions about classes or professors — student experience varies a lot, and I'd rather not launder one opinion as fact. For honest perspectives from MIT students, the best resources are:

- **OpenGrades**: <https://opengrades.mit.edu/> (anonymized grade & difficulty data)
- **End-of-term subject evaluations** (in WebSIS, when logged in)

If you want, I can give you the **factual** picture instead: what the class teaches, what its prereqs are, when it's offered, and how it fits into your major. Just ask.`;

const OFF_TOPIC = `I'm Course Compass — I'm built to help with MIT academic planning (course requirements, scheduling, finding classes on a topic). I'd rather not stretch beyond that. Is there an MIT course or requirement question I can help you with?`;

/** Defense-in-depth: classifier sometimes omits CI-M filter on CIM2 / EECS CI-M list questions. */
function questionImpliesEecsCim2List(q: string): boolean {
  const s = q.toLowerCase();
  if (/\bcim\s*2\b/.test(s) || /\bcim2\b/.test(s)) return true;
  if (/second\s+ci[-\s]?m/.test(s) && /(eecs|6-3|6-4|course\s*6|six)/.test(s)) return true;
  if (
    /ci[-\s]?m/.test(s) &&
    /(eecs|cim|6-3|6-4|satisfy|satisfies|requirement|which\s+class|what\s+class|list|all|every)/.test(
      s,
    )
  )
    return true;
  return false;
}

function augmentEecsCim2FromQuestion(
  question: string,
  classification: ClassificationResult,
): ClassificationResult {
  if (!questionImpliesEecsCim2List(question)) return classification;
  return {
    ...classification,
    filters: {
      ...classification.filters,
      ci: "CI-M",
      department: classification.filters?.department ?? "6",
    },
    intents: {
      ...classification.intents,
      isListQuery: true,
    },
  };
}

/** Heuristic: timetable / Hydrant week preview / overlap among named subjects. */
function questionImpliesScheduleFit(q: string): boolean {
  if (questionMeansChatHydrantSchedule(q)) return true;
  if (questionImpliesHassSlotInThreadSchedule(q)) return true;
  if (questionRefinesThreadSchedule(q)) return true;
  const s = q.toLowerCase();
  if (/\bfit\s+(in\s+)?(my\s+)?schedule\b/.test(s)) return true;
  if (/\bschedule\b/.test(s) && /\b(conflict|overlap|collide|collision|double|same time)\b/.test(s))
    return true;
  if (/\b(time\s*)?conflict\b/.test(s) && /\b(class|course|take|taking)\b/.test(s)) return true;
  if (/\bwill\b/.test(s) && /\bfit\b/.test(s) && /(\d{1,2}\.|taking|and\s+\d)/.test(s)) return true;
  if (/\b(together|same slot|overlap)\b/.test(s) && /\d{1,2}\./.test(s)) return true;
  return false;
}

function augmentScheduleFitFromQuestion(
  question: string,
  classification: ClassificationResult,
): ClassificationResult {
  const mergedIds = [
    ...new Set([
      ...(classification.mentionedCourseIds ?? []),
      ...extractCourseIdsFromText(question),
    ]),
  ];
  if (mergedIds.length < 1 || !questionImpliesScheduleFit(question)) return classification;
  return {
    ...classification,
    mentionedCourseIds: mergedIds,
    intents: {
      ...classification.intents,
      wantsScheduleFit: true,
    },
  };
}

function normalizeCourseIdKey(id: string): string {
  return id.trim().toLowerCase();
}

function dedupeCourseIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const k = normalizeCourseIdKey(id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(id.trim());
  }
  return out;
}

function lastAssistantCourseIdPreferLatest(history: ChatMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "assistant") continue;
    const ids = extractCourseIdsFromText(history[i].content);
    if (ids.length) return ids[ids.length - 1]!;
  }
  return null;
}

/**
 * In this chat, “schedule / hydrant schedule / my schedule” means the weekly
 * **Hydrant** grid we embed — not a generic English sense of “schedule”.
 */
function questionMeansChatHydrantSchedule(q: string): boolean {
  const s = q.toLowerCase();
  if (/\bhydrant\b/.test(s)) return true;
  if (/\b(hydrant\s+)?schedule\b/.test(s)) return true;
  if (/\b(this|that|the)\s+schedule\b/.test(s)) return true;
  if (/\bmy\s+schedule\b/.test(s)) return true;
  if (/\bweekly\s+(schedule|grid)\b/.test(s)) return true;
  if (
    /\b(schedule|scheduling)\b/.test(s) &&
    (/\d{1,2}\./.test(s) || extractCourseIdsFromText(q).length > 0)
  )
    return true;
  if (
    /\b(schedule|scheduling)\b/.test(s) &&
    /\b(fall|spring|summer|iap|f\d{2}|s\d{2}|m\d{2}|i\d{2})\b/.test(s)
  )
    return true;
  return false;
}

/**
 * “Add 6.5110 to my hydrant schedule” / “add it to the one you rendered” —
 * merge into the last course list from the thread.
 */
function parseHydrantScheduleAdd(question: string): null | {
  explicitIds: string[];
  usesItOrThat: boolean;
} {
  const s = question.toLowerCase();
  if (!/\badd\b/.test(s)) return null;

  const targetsPreview =
    /\bhydrant\b/.test(s) ||
    /\b(hydrant\s+)?schedule\b/.test(s) ||
    /\bmy\s+schedule\b/.test(s) ||
    /\bweekly\s+(schedule|grid)\b/.test(s) ||
    /\b(the\s+)?(one|preview|grid)\s+(you\s+)?(rendered|showed|made|before|earlier)\b/.test(s) ||
    /\b(that|the\s+same)\s+(hydrant|preview|schedule|grid)\b/.test(s);

  if (!targetsPreview) return null;

  const usesItOrThat =
    /\badd\s+(it|that)\b/.test(s) ||
    /\badd\s+this\s+(class|course)\b/.test(s) ||
    /\badd\s+that\s+(class|course)\b/.test(s);

  const explicitIds = extractCourseIdsFromText(question);
  return { explicitIds, usesItOrThat };
}

/** swap X for Y / replace X with Y — used to rewrite a prior multi-course Hydrant list. */
function parseCourseSubstitution(question: string): { from: string; to: string } | null {
  let m = question.match(
    new RegExp(`\\breplace\\s+(${RE_MIT_SUBJECT_FULL})\\s+with\\s+(${RE_MIT_SUBJECT_FULL})\\b`, "i"),
  );
  if (m) return { from: m[1], to: m[2] };
  m = question.match(
    new RegExp(
      `\\bswap\\s+(${RE_MIT_SUBJECT_FULL})\\s+(?:for|with)\\s+(${RE_MIT_SUBJECT_FULL})\\b`,
      "i",
    ),
  );
  if (m) return { from: m[1], to: m[2] };
  return null;
}

/**
 * Same as {@link parseCourseSubstitution}, but resolves “this class / that one” from the
 * most recent assistant reply (e.g. after the student asked about 6.5110).
 */
function parseCourseSubstitutionFromHistory(
  question: string,
  history: ChatMessage[],
): { from: string; to: string } | null {
  const strict = parseCourseSubstitution(question);
  if (strict) return strict;
  const loose = question.match(
    new RegExp(
      `\\breplace\\s+(${RE_MIT_SUBJECT_FULL})\\s+with\\s+(?:this\\s+class|that\\s+class|that\\s+one|it)\\b`,
      "i",
    ),
  );
  if (!loose) return null;
  const from = loose[1];
  const fromKey = normalizeCourseIdKey(from);
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "assistant") continue;
    const ids = extractCourseIdsFromText(history[i].content);
    for (let j = ids.length - 1; j >= 0; j--) {
      const id = ids[j];
      if (normalizeCourseIdKey(id) !== fromKey) return { from, to: id };
    }
  }
  return null;
}

function findLatestUserCourseList(
  history: ChatMessage[],
  minCount: number,
): string[] | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "user") continue;
    const ids = extractCourseIdsFromText(history[i].content);
    if (ids.length >= minCount) return ids;
  }
  return null;
}

/**
 * Prefer the most recent user message that lists **several** subjects (a real
 * schedule line-up). If the latest user line only has one id (e.g. “add 6.5110”),
 * we still find the earlier multi-class message.
 */
function findHydrantScheduleBaselineUserList(history: ChatMessage[]): string[] | null {
  return findLatestUserCourseList(history, 2) ?? findLatestUserCourseList(history, 1);
}

/** Last assistant turn that returned a Hydrant embed — canonical subjects from the server. */
function getLatestEmbedScheduleCourseIds(history: ChatMessage[]): string[] | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "assistant") continue;
    const ids = m.scheduleCourseIds;
    if (ids && ids.length > 0) return dedupeCourseIds(ids);
  }
  return null;
}

/** User is naming a new multi-subject term preview — don’t merge older embed subjects. */
function looksLikeFreshHydrantScheduleQuestion(question: string): boolean {
  const ids = extractCourseIdsFromText(question);
  if (ids.length < 2) return false;
  return (
    parseSemesterMention(question) != null ||
    /\b(show|give|render|pull\s+up)\b.*\b(schedule|hydrant|calendar|grid)\b/i.test(question)
  );
}

/** Clarifications like “I meant with 6.1810 also” — keep thread schedule context. */
function questionRefinesThreadSchedule(q: string): boolean {
  const s = q.toLowerCase();
  if (!/\d{1,2}\./.test(s) && extractCourseIdsFromText(q).length === 0) return false;
  return (
    /\b(i\s+meant|actually|instead)\b/.test(s) ||
    (/\b(also|plus|and)\b/.test(s) && /\b(schedule|hydrant|grid|week|class(?:es)?)\b/.test(s)) ||
    (/\bwith\b/.test(s) && /\balso\b/.test(s) && /\b(schedule|hydrant|grid)\b/.test(s))
  );
}

function applyCourseSubstitution(baseline: string[], fromRaw: string, toRaw: string): string[] {
  const from = normalizeCourseIdKey(fromRaw);
  const to = toRaw.trim();
  const next = baseline.map((id) => (normalizeCourseIdKey(id) === from ? to : id));
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const id of next) {
    const k = normalizeCourseIdKey(id);
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(id);
  }
  return deduped;
}

function questionImpliesHydrantPreviewRequest(q: string): boolean {
  if (questionMeansChatHydrantSchedule(q)) return true;
  if (parseCourseSubstitution(q)) return true;
  if (
    new RegExp(
      `\\breplace\\s+(${RE_MIT_SUBJECT_FULL})\\s+with\\s+(this\\s+class|that\\s+class|that\\s+one|it)\\b`,
      "i",
    ).test(q)
  )
    return true;
  const s = q.toLowerCase();
  if (/\b(show|display|render|give|pull\s+up)\b/.test(s) && /\b(schedule|calendar|hydrant|weekly\s+grid)\b/.test(s))
    return true;
  if (/\bhydrant\b/.test(s) && /\b(replace|swap|update|change|add|remove)\b/.test(s)) return true;
  return false;
}

function questionImpliesHassSlotInThreadSchedule(q: string): boolean {
  const s = q.toLowerCase();
  const hassA =
    /\bhass[-\s]?a\b/.test(s) ||
    /\bhassa\b/.test(s);
  if (!hassA) return false;
  return (
    /\b(fit|fits|fitting|slot|slots|space|work|go|add|place|put|options?)\b/.test(s) ||
    /\b(this|that|my|the|your)\s+(schedule|calendar|week|grid)\b/.test(s) ||
    /\b(in|into|with|alongside)\s+(this|that|my|the|your)\s+(schedule|calendar|week)\b/.test(s)
  );
}

function questionAsksHydrantRerender(q: string): boolean {
  const s = q.toLowerCase();
  if (!/\b(again|same\s+schedule|same\s+calendar|previous|earlier|you\s+(made|showed)|that\s+hydrant)\b/.test(s))
    return false;
  return /\b(schedule|calendar|hydrant|grid|preview|week)\b/.test(s);
}

/**
 * Hydrant embed follow-ups: swap/replace subjects using the last multi-course
 * user message, or re-use listed subjects when the student asks to see the grid again.
 * Forces **factual** so we never advisor-redirect a URL rebuild.
 */
function augmentHydrantScheduleFromQuestion(
  question: string,
  history: ChatMessage[],
  classification: ClassificationResult,
): ClassificationResult {
  const fromModelAndText = [
    ...new Set([
      ...(classification.mentionedCourseIds ?? []),
      ...extractCourseIdsFromText(question),
    ]),
  ];

  const embedScheduleIds = getLatestEmbedScheduleCourseIds(history);
  let merged = fromModelAndText;
  if (!looksLikeFreshHydrantScheduleQuestion(question) && embedScheduleIds?.length) {
    merged = dedupeCourseIds([...embedScheduleIds, ...fromModelAndText]);
  }

  const addIntent = parseHydrantScheduleAdd(question);
  const substitution = parseCourseSubstitutionFromHistory(question, history);

  if (substitution) {
    const baseline =
      getLatestEmbedScheduleCourseIds(history) ?? findLatestUserCourseList(history, 2);
    if (baseline) {
      merged = applyCourseSubstitution(baseline, substitution.from, substitution.to);
    }
  } else if (addIntent) {
    const baseline =
      getLatestEmbedScheduleCourseIds(history) ?? findHydrantScheduleBaselineUserList(history);
    let extra: string[] = [...addIntent.explicitIds];
    if (addIntent.usesItOrThat && extra.length === 0) {
      const it = lastAssistantCourseIdPreferLatest(history);
      if (it) extra.push(it);
    }
    if (baseline && extra.length) {
      merged = dedupeCourseIds([...baseline, ...extra]);
    } else if (baseline && addIntent.explicitIds.length > 0) {
      merged = dedupeCourseIds([...baseline, ...addIntent.explicitIds]);
    } else if (extra.length) {
      merged = dedupeCourseIds(extra);
    } else if (addIntent.explicitIds.length > 0) {
      merged = dedupeCourseIds(addIntent.explicitIds);
    }
  } else if (merged.length < 2 && questionAsksHydrantRerender(question)) {
    const baseline =
      getLatestEmbedScheduleCourseIds(history) ?? findHydrantScheduleBaselineUserList(history);
    if (baseline) merged = [...baseline];
  } else if (merged.length < 2 && questionImpliesHassSlotInThreadSchedule(question)) {
    const baseline =
      getLatestEmbedScheduleCourseIds(history) ?? findHydrantScheduleBaselineUserList(history);
    if (baseline?.length) merged = [...baseline];
  }

  const scheduleRewriteIntent =
    questionImpliesScheduleFit(question) ||
    questionImpliesHydrantPreviewRequest(question) ||
    questionImpliesHassSlotInThreadSchedule(question) ||
    (questionAsksHydrantRerender(question) && merged.length >= 1);

  if (!scheduleRewriteIntent || merged.length < 1) {
    return {
      ...classification,
      mentionedCourseIds: merged.length ? merged : classification.mentionedCourseIds,
    };
  }

  const forceFactual =
    classification.category === "personal_high_stakes" || classification.category === "off_topic";

  return {
    ...classification,
    mentionedCourseIds: merged,
    category: forceFactual ? "factual" : classification.category,
    rationale: forceFactual
      ? "Hydrant / weekly schedule preview (treated as factual)."
      : classification.rationale,
    intents: {
      ...classification.intents,
      wantsScheduleFit: true,
      wantsSimilarCourses:
        substitution || addIntent ? false : classification.intents.wantsSimilarCourses,
    },
  };
}

function formatEecsCim2ListContext(): string {
  return [
    "EECS CI-M subjects (CIM2 list — used for second CI-M / CIM2-style requirements on newer Course 6 charts).",
    "Canonical subject IDs (answer from this list; do not say data is missing):",
    CIM2_SUBJECTS.join(", "),
    "",
    GROUPINGS_FALL2026_NOTE,
    `Official subject-groupings chart: ${GROUPINGS_SOURCE_URL}`,
  ].join("\n");
}

function buildScheduleSemesterClarification(mentionedCourseIds: string[]): string {
  const listed = mentionedCourseIds.map((id) => `**${id}**`).join(", ");
  return [
    "Which **semester** should I use?",
    "",
    `You mentioned: ${listed}.`,
    "",
    "Reply with something like **Spring 2027**, **Fall 2026**, or **s27** / **f26**.",
  ].join("\n");
}

const SCHEDULE_PREVIEW_MESSAGE =
  "Here’s roughly how that week would look with those subjects. Meeting times and rooms can still change — confirm on the official subject listing and the registrar.";

function courseOfferedInTerm(c: Course, season: CatalogSeason): boolean {
  return c.offered[season];
}

function filterRetrievedForTermAndHydrant(
  alts: Retrieved[],
  notForCourse: Course,
  season: CatalogSeason,
  hydrantClassSet: Set<string> | null,
): Retrieved[] {
  const block = new Set(
    [notForCourse.id, ...notForCourse.jointSubjects, ...notForCourse.meetsWith].map(
      (id) => normalizeCourseIdKey(id),
    ),
  );
  return alts.filter((r) => {
    if (block.has(normalizeCourseIdKey(r.course.id))) return false;
    if (!courseOfferedInTerm(r.course, season)) return false;
    if (hydrantClassSet && !hydrantClassSet.has(normalizeHydrantCourseId(r.course.id)))
      return false;
    return true;
  });
}

function hassAHasNoTimeOverlapWith(hass: Course, locked: Course[]): boolean {
  if (hass.meetings.length === 0) return true;
  for (const hm of hass.meetings) {
    for (const lock of locked) {
      for (const bm of lock.meetings) {
        if (meetingsOverlap(hm, bm)) return false;
      }
    }
  }
  return true;
}

/**
 * HASS-A subjects for the same term that don’t overlap catalog meeting rows with the locked set.
 */
function buildHassAScheduleAddon(
  courseById: Map<string, Course>,
  lockedIds: string[],
  semSched: { season: CatalogSeason; year: number },
  hydrantClassSet: Set<string> | null,
): { text: string; hassCourseIds: string[] } {
  const locked = lockedIds
    .map((id) => courseById.get(id))
    .filter((c): c is Course => c != null);
  const season = semSched.season;
  const candidates: Course[] = [];
  for (const c of courseById.values()) {
    if (c.hassAttribute !== "HASS-A") continue;
    if (!courseOfferedInTerm(c, season)) continue;
    if (hydrantClassSet && !hydrantClassSet.has(normalizeHydrantCourseId(c.id))) continue;
    if (locked.some((l) => normalizeCourseIdKey(l.id) === normalizeCourseIdKey(c.id))) continue;
    if (!hassAHasNoTimeOverlapWith(c, locked)) continue;
    candidates.push(c);
  }
  candidates.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const top = candidates.slice(0, 18);
  if (top.length === 0) {
    return {
      text:
        "**HASS-A:** No HASS-A subjects in this snapshot matched this term’s filters *and* avoided overlapping meeting rows with your listed subjects. Try asking “HASS-A classes in Spring 2027” without the schedule shortcut, or confirm sections in Hydrant.",
      hassCourseIds: [],
    };
  }
  const lines = [
    "**HASS-A subjects that look compatible by meeting times** (vs. catalog rows for your current subjects — pick a section in Hydrant to be sure):",
    ...top.map((c) => `- **${c.id}** — ${c.title}`),
  ];
  return { text: lines.join("\n"), hassCourseIds: top.map((c) => c.id) };
}

/** Human-readable which terms the snapshot marks as offered (for “not this semester” copy). */
function offeredTermsLabel(c: Course): string {
  const parts: string[] = [];
  if (c.offered.fall) parts.push("Fall");
  if (c.offered.iap) parts.push("IAP");
  if (c.offered.spring) parts.push("Spring");
  if (c.offered.summer) parts.push("Summer");
  return parts.length ? parts.join("/") : "not marked in this snapshot";
}

function buildSchedulePreviewBody(
  semSched: { season: CatalogSeason; year: number },
  resolved: ResolvedHydrantTerm,
  notOffered: Course[],
  alternativesByCourseId: Map<string, Retrieved[]>,
  /** When set, copy references Hydrant’s term file (same as the embed). */
  usedHydrantTermCheck: boolean,
): string {
  const termLabel = formatSemesterLabel(semSched);
  const lines: string[] = [SCHEDULE_PREVIEW_MESSAGE];
  if (resolved.fallbackNote?.trim()) {
    lines.push("");
    lines.push(resolved.fallbackNote.trim());
  }
  if (notOffered.length === 0) {
    return lines.join("\n");
  }
  lines.push("");
  const sourceLine = usedHydrantTermCheck
    ? `**Offering note (${termLabel}, Hydrant term \`${resolved.slug}\`):** These subjects are **not** in that term’s Hydrant course list and/or not flagged for this season in our FireRoad snapshot. The grid below still includes your picks for planning:`
    : `**Offering note (${termLabel}):** In the FireRoad snapshot Course Compass uses, these subjects are **not** flagged as offered this term. The Hydrant calendar below still includes them if you want to preview anyway:`;
  lines.push(sourceLine);
  const seenAltIds = new Set<string>();
  for (const c of notOffered) {
    const offeredWhen = offeredTermsLabel(c);
    lines.push(`- **${c.id}** — in our data it’s listed for: ${offeredWhen}.`);
    const alts = (alternativesByCourseId.get(c.id) ?? [])
      .map((r) => r.course)
      .filter((a) => a.id !== c.id && !notOffered.some((u) => u.id === a.id));
    const picked: Course[] = [];
    for (const a of alts) {
      if (seenAltIds.has(a.id)) continue;
      seenAltIds.add(a.id);
      picked.push(a);
      if (picked.length >= 5) break;
    }
    if (picked.length > 0) {
      const explain = usedHydrantTermCheck
        ? `Subjects listed for **${termLabel}** in Hydrant’s \`${resolved.slug}\` file (and matching our FireRoad term filters)`
        : `Options **also flagged for ${termLabel}** in our catalog data`;
      lines.push(`  - Similar ${explain}: ${picked.map((a) => `**${a.id}** (${a.title})`).join("; ")}.`);
    } else {
      lines.push(
        usedHydrantTermCheck
          ? `  - No similar subjects turned up that appear in Hydrant’s **${resolved.slug}** list for **${termLabel}** after filtering — try “classes similar to ${c.id}” without the schedule shortcut.`
          : `  - No close substitutes with the same term flag turned up in this snapshot — try asking “classes similar to ${c.id}” for a broader list.`,
      );
    }
  }
  return lines.join("\n");
}

/** Default / primary catalog year for new entrants (Fall 2026 listings for 6-3). */
const PRIMARY_CATALOG_YEAR: CatalogYear = "2026-2027";

/**
 * Strips hallucinated catalog archive URLs and appends authoritative chart URLs
 * from loaded major objects when the model omitted or contradicted them.
 */
function sanitizeAnswerOfficialSources(
  text: string,
  majors: MajorRequirement[],
  /** Catalog year actually used to load these majors (may differ from major.catalogYear on shared objects). */
  loadedAsCatalogYear?: string,
): string {
  if (!majors.length) return text;
  let t = text.replace(/https:\/\/catalog\.mit\.edu\/archive\/[^)\s\]"']+/gi, "");
  t = t.replace(/^\s*(?:\*\*)?Source(?:\s+URL)?\s*:\s*$/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  const missing = majors.filter((m) => !t.includes(m.sourceUrl));
  if (missing.length === 0) return t.trimEnd();
  const yearLabel = loadedAsCatalogYear ?? missing[0]?.catalogYear ?? "";
  const block =
    "\n\n**Official MIT degree chart(s) (verify here):**\n" +
    missing
      .map((m) => `- ${m.sourceUrl} — ${m.name} (catalog ${yearLabel})`)
      .join("\n");
  return `${t.trimEnd()}${block}`;
}

function formatTracksContext(): string {
  const lines: string[] = [
    `Source: ${TRACKS_SOURCE_URL}`,
    "",
    "Each track is a list of approved subjects. Some tracks have additional sub-rules.",
    "",
  ];
  for (const t of TRACKS) {
    lines.push(`- ${t.id} — ${t.name} (${t.area.toUpperCase()})`);
    lines.push(`    subjects: ${t.subjects.join(", ")}`);
    if (t.subRulesNote) lines.push(`    sub-rule: ${t.subRulesNote}`);
  }
  return lines.join("\n");
}

export async function generateAnswer(input: AnswerInput): Promise<AnswerResult> {
  const threadHistory = input.history.slice(-CHAT_THREAD_MAX_MESSAGES);
  const classification = augmentHydrantScheduleFromQuestion(
    input.question,
    threadHistory,
    augmentScheduleFitFromQuestion(
      input.question,
      augmentEecsCim2FromQuestion(input.question, input.classification),
    ),
  );

  const substitutionEarly = parseCourseSubstitutionFromHistory(input.question, threadHistory);
  if (substitutionEarly && !findLatestUserCourseList(threadHistory, 2)) {
    return {
      text:
        `I don’t see an earlier multi-course list in this chat to swap **${substitutionEarly.from}** for **${substitutionEarly.to}**. Paste every subject again with the term (**Fall 2026**, **f26**, etc.), or repeat your earlier question.`,
      citations: [],
      classification: { ...classification, category: "factual" },
    };
  }

  const qCal = input.question.toLowerCase();
  const isPersonalCalendarAddRequest =
    /\badd\b/.test(qCal) &&
    /\b(my\s+)?calendar\b/.test(qCal) &&
    !/\bhydrant\b/.test(qCal) &&
    !classification.intents.wantsScheduleFit;

  if (
    (classification.category === "factual" || classification.category === "off_topic") &&
    isPersonalCalendarAddRequest
  ) {
    return {
      text:
        "Course Compass can’t write events to your personal calendar app (Google, Apple, Outlook). To see an MIT **Hydrant** week preview in this chat, ask with a term (**Fall 2026**, **f26**) and your subject numbers — or open [Hydrant](https://hydrant.mit.edu/) and use **Share** there.",
      citations: [],
      classification: { ...classification, category: "factual" },
    };
  }

  if (classification.category === "personal_high_stakes") {
    return { text: ADVISOR_REDIRECT, citations: [], classification };
  }
  if (classification.category === "opinion") {
    return { text: OPINION_DEFLECTION, citations: [], classification };
  }
  if (classification.category === "off_topic") {
    return { text: OFF_TOPIC, citations: [], classification };
  }

  const intents = classification.intents;
  // Build the set of majors in scope. Mentioned majors come first (they're
  // what the user is asking about); the selected major is included as a
  // fallback / second perspective. Comparison questions like "if I switch
  // from 6-3 to 6-14" naturally produce multiple entries here.
  // Resolve the catalog year: use what the user passed, else primary year.
  const rawYear = input.catalogYear ?? PRIMARY_CATALOG_YEAR;
  const catalogYear: CatalogYear =
    (CATALOG_YEARS as readonly string[]).includes(rawYear)
      ? (rawYear as CatalogYear)
      : PRIMARY_CATALOG_YEAR;

  const mentionedMajorIds = classification.mentionedMajorIds ?? [];
  const selectedMajor =
    input.majorId ? (getMajor(input.majorId, catalogYear) ?? MAJORS[input.majorId]) : undefined;
  const inScopeMajors: MajorRequirement[] = [];
  const seenMajors = new Set<string>();
  for (const id of mentionedMajorIds) {
    const m = getMajor(id, catalogYear) ?? MAJORS[id];
    if (m && !seenMajors.has(m.id)) {
      inScopeMajors.push(m);
      seenMajors.add(m.id);
    }
  }
  if (selectedMajor && !seenMajors.has(selectedMajor.id)) {
    inScopeMajors.push(selectedMajor);
    seenMajors.add(selectedMajor.id);
  }
  // The "primary" major drives PROGRESS_CONTEXT and the source-URL footer.
  const major = inScopeMajors[0];
  const corpus = await getCourses();
  const completedCourseIds = input.completedCourseIds ?? [];

  // Retrieval — list-mode when the user asked for "all X", similarity mode
  // when the user asked for alternatives to a specific course.
  const retrievalQuery = classification.searchQuery ?? input.question;
  const mentionedIds = dedupeCourseIds([
    ...(classification.mentionedCourseIds ?? []),
    ...extractCourseIdsFromText(input.question),
  ]);
  // We seed the similarity search with the course's own embedding when the
  // user explicitly asked for alternatives, OR when they referenced courses
  // and asked something content-like ("what's like 6.3260").
  const useSimilarity =
    intents.wantsSimilarCourses && mentionedIds.length > 0;

  const retrieved = await retrieve(retrievalQuery, {
    department: classification.filters?.department,
    hass: classification.filters?.hass,
    ci: classification.filters?.ci,
    offered: classification.filters?.offered,
    gir: classification.filters?.gir,
    listMode: intents.isListQuery,
    similarToCourseIds: useSimilarity ? mentionedIds : undefined,
    limit: intents.isListQuery ? 60 : useSimilarity ? 18 : 8,
  });

  // If the user asked about progress / what's left, evaluate the major now
  // and surface open + partial nodes (with their candidate courses) as
  // additional context.
  let progress: ProgressReport | undefined;
  if (major && intents.needsProgress) {
    progress = evaluateMajor(major, completedCourseIds, corpus);
  }

  // If the user mentions joint listings, expand the retrieved courses with
  // their joint/meets-with siblings so the model can talk about both numbers.
  const courseById = new Map(corpus.map((c) => [c.id, c] as const));
  let enrichedRetrieved = intents.mentionsJointListings
    ? expandWithJointListings(retrieved, courseById)
    : retrieved;
  // When the user mentioned specific courses, always make sure those courses
  // themselves appear in the COURSE_CONTEXT (pinned to the front), even if
  // they're not in the top-k retrieval set. This guarantees the LLM has
  // their full descriptions available to compare against alternatives.
  if (mentionedIds.length > 0) {
    enrichedRetrieved = pinReferencedCourses(
      enrichedRetrieved,
      mentionedIds,
      courseById,
    );
  }

  if (intents.wantsScheduleFit && mentionedIds.length >= 1 && !parseSemesterMentionWithHistory(input.question, threadHistory)) {
    const citationSet = new Map<string, AnswerCitation>();
    for (const raw of mentionedIds) {
      const c = resolveCourseFromMention(raw, courseById);
      if (c && !citationSet.has(c.id)) {
        citationSet.set(c.id, {
          courseId: c.id,
          title: c.title,
          url: c.catalogUrl,
        });
      }
    }
    return {
      text: buildScheduleSemesterClarification(mentionedIds),
      citations: [...citationSet.values()],
      classification,
    };
  }

  const semSched = parseSemesterMentionWithHistory(input.question, threadHistory);
  if (intents.wantsScheduleFit && mentionedIds.length >= 1 && semSched) {
    const resolved = await resolveHydrantTermSlug(semSched);
    const fitReport = analyzeScheduleFit(mentionedIds, courseById);
    const idsForHydrant = fitReport.courseIds;
    const citationSet = new Map<string, AnswerCitation>();
    for (const raw of mentionedIds) {
      const c = resolveCourseFromMention(raw, courseById);
      if (c && !citationSet.has(c.id)) {
        citationSet.set(c.id, {
          courseId: c.id,
          title: c.title,
          url: c.catalogUrl,
        });
      }
    }
    if (idsForHydrant.length === 0) {
      return {
        text: "I couldn’t match those subject numbers to the catalog snapshot here, so I can’t lay out a week yet.",
        citations: [...citationSet.values()],
        classification,
      };
    }

    const hydrantClassSet = await getHydrantClassIdSetForTerm(resolved.slug);

    const notOffered: Course[] = [];
    for (const id of idsForHydrant) {
      const c = courseById.get(id);
      if (!c) continue;
      const inHydrantTerm = hydrantClassSet?.has(normalizeHydrantCourseId(id)) ?? true;
      const fireRoadTerm = courseOfferedInTerm(c, semSched.season);
      if (!inHydrantTerm || !fireRoadTerm) {
        notOffered.push(c);
      }
    }

    const alternativesByCourseId = new Map<string, Retrieved[]>();
    for (const c of notOffered) {
      const alts = await retrieve(`${c.id} ${c.title}`, {
        similarToCourseIds: [c.id],
        offered: semSched.season,
        limit: 12,
      });
      const filtered = filterRetrievedForTermAndHydrant(
        alts,
        c,
        semSched.season,
        hydrantClassSet,
      );
      alternativesByCourseId.set(c.id, filtered.slice(0, 8));
    }

    for (const alts of alternativesByCourseId.values()) {
      for (const r of alts) {
        const ac = r.course;
        if (!citationSet.has(ac.id)) {
          citationSet.set(ac.id, {
            courseId: ac.id,
            title: ac.title,
            url: ac.catalogUrl,
          });
        }
      }
    }

    const textBase = buildSchedulePreviewBody(
      semSched,
      resolved,
      notOffered,
      alternativesByCourseId,
      hydrantClassSet != null,
    );

    let text = textBase;
    if (questionImpliesHassSlotInThreadSchedule(input.question)) {
      const hassAddon = buildHassAScheduleAddon(
        courseById,
        idsForHydrant,
        semSched,
        hydrantClassSet,
      );
      text = `${textBase}\n\n${hassAddon.text}`;
      for (const hid of hassAddon.hassCourseIds) {
        const hc = courseById.get(hid);
        if (hc && !citationSet.has(hc.id)) {
          citationSet.set(hc.id, {
            courseId: hc.id,
            title: hc.title,
            url: hc.catalogUrl,
          });
        }
      }
    }

    return {
      text,
      citations: [...citationSet.values()],
      classification,
      scheduleCourseIds: idsForHydrant,
      scheduleHydrant: {
        url: buildHydrantScheduleUrl(idsForHydrant, resolved.slug),
      },
    };
  }

  const includeTracks =
    intents.mentionsTrack ||
    (mentionedIds.length > 0 && inScopeMajors.length > 0);

  let text = await synthesizeFactualAnswer({
    question: input.question,
    history: threadHistory,
    retrieved: enrichedRetrieved,
    majors: inScopeMajors,
    completedCourseIds,
    progress,
    intents,
    courseById,
    includeTracks,
    mentionedCourseIds: mentionedIds,
    catalogYear,
    graduationYear: input.graduationYear,
    filters: classification.filters,
  });
  text = sanitizeAnswerOfficialSources(text, inScopeMajors, catalogYear);

  // Detect citations: any course id that appears in the answer and was in
  // the retrieved set (or a sibling joint listing).
  const citationSet = new Map<string, AnswerCitation>();
  for (const r of enrichedRetrieved) {
    const ids = [r.course.id, ...r.course.jointSubjects, ...r.course.meetsWith];
    for (const id of ids) {
      if (text.includes(id)) {
        const c = courseById.get(id) ?? r.course;
        if (!citationSet.has(c.id)) {
          citationSet.set(c.id, {
            courseId: c.id,
            title: c.title,
            url: c.catalogUrl,
          });
        }
      }
    }
  }
  if (intents.wantsScheduleFit && mentionedIds.length >= 1) {
    for (const raw of mentionedIds) {
      const c = resolveCourseFromMention(raw, courseById);
      if (c && !citationSet.has(c.id)) {
        citationSet.set(c.id, {
          courseId: c.id,
          title: c.title,
          url: c.catalogUrl,
        });
      }
    }
  }
  const citations = [...citationSet.values()];

  return { text, citations, classification };
}

interface SynthesizeArgs {
  question: string;
  history: ChatMessage[];
  retrieved: Retrieved[];
  majors: MajorRequirement[];
  completedCourseIds: string[];
  progress?: ProgressReport;
  intents: ClassificationResult["intents"];
  courseById: Map<string, Course>;
  includeTracks: boolean;
  /** Course IDs from classifier + regex safety net (used for computed coverage). */
  mentionedCourseIds: string[];
  catalogYear?: string;
  graduationYear?: number | null;
  /** Classifier filters (after CIM2 heuristic merge). */
  filters?: ClassificationResult["filters"];
}

async function synthesizeFactualAnswer(args: SynthesizeArgs): Promise<string> {
  const courseContext = formatRetrievedContext(args.retrieved);

  // Build a one-liner about the student's catalog year so the LLM can
  // caveat any answers that differ between years.
  const yearContext =
    args.catalogYear && args.catalogYear !== PRIMARY_CATALOG_YEAR
      ? `STUDENT CATALOG YEAR: ${args.catalogYear}${args.graduationYear ? ` (Class of ${args.graduationYear})` : ""}. ` +
        `All requirement data below is from this catalog year, NOT the primary ${PRIMARY_CATALOG_YEAR} catalog. ` +
        `If the student asks about requirements, cite the ${args.catalogYear} source URLs from MAJOR_CONTEXT.`
      : args.graduationYear
        ? `STUDENT INFO: Class of ${args.graduationYear}, using ${args.catalogYear ?? PRIMARY_CATALOG_YEAR} catalog requirements.`
        : "";

  const majorBlock =
    args.majors.length > 0
      ? args.majors
          .map((m) => formatMajorContext(m, args.completedCourseIds))
          .join("\n\n=== NEXT MAJOR ===\n\n")
      : "(No major in scope for this question.)";

  const progressBlock = args.progress
    ? formatProgressContext(args.progress)
    : args.intents.needsProgress && args.majors.length === 0
      ? "(The user asked about progress, but no major is selected. Encourage them to pick one from the dropdown.)"
      : "";

  const tracksBlock = args.includeTracks ? formatTracksContext() : "";

  const includeCim2List =
    questionImpliesEecsCim2List(args.question) ||
    (args.filters?.ci === "CI-M" &&
      (args.filters?.department == null || args.filters.department === "6"));
  const cim2Block = includeCim2List ? formatEecsCim2ListContext() : "";

  const canonicalMentioned = [
    ...new Set(
      args.mentionedCourseIds.map((id) => resolveCanonicalCourseId(id, args.courseById)),
    ),
  ];
  const coverageBlock =
    canonicalMentioned.length > 0 && args.majors.length > 0
      ? formatCourseRequirementCoverage({
          courseIds: canonicalMentioned,
          majors: args.majors,
          courseById: args.courseById,
          answerCatalogYear: args.catalogYear ?? PRIMARY_CATALOG_YEAR,
        })
      : "";

  const system = `You are Course Compass, a grounded academic-planning assistant for MIT students.

YOUR CORE PROMISE: answer ANY factual question about MIT majors, requirements,
classes, prerequisites, scheduling, tracks, or cross-listings — directly and
in full. Use the data blocks in this prompt (requirement trees, optional computed
course mapping, progress, track lists, and retrieved courses). These blocks are
for you only — do not name them to the student (see style rule below).
Do NOT redirect the student to the MIT catalog when the answer is sitting
right there in your context.

You are only allowed to redirect away from the chat in two situations:
- OPINION questions about a class/professor being "good", "easy", "hard",
  "fun" → redirect to OpenGrades / subject evaluations.
- PERSONAL high-stakes questions ("should I switch majors?", "am I cut out
  for CS?") → redirect to a human academic advisor.

Both of those are pre-handled by the classifier; if you got here, the
question is FACTUAL and you should answer it.

Hard rules:
1. When MAJOR_CONTEXT contains a full requirement tree, answer requirements
   questions by walking that tree. Reproduce every requirement section: GIRs,
   major core, electives, tracks, cross-cutting constraints. Do not summarize
   into a vague "you need 17 GIRs and a major" — list the actual nodes.
2. Always write course IDs literally (e.g., 6.1010, CMS.303) so they can be cited.
   Never invent course IDs.
2a. **User-facing style (CRITICAL)**: Write like a human advisor. Do **not** mention
   internal prompt labels such as MAJOR_CONTEXT, COVERAGE_CONTEXT, TRACKS_CONTEXT,
   COURSE_CONTEXT, EECS_CIM2_SUBJECT_LIST, PROGRESS_CONTEXT, or phrases like "node id". Do **not** say
   "track 1 slot" / "track 2 slot" — instead say **the first track requirement**
   (two subjects from **one** CS track) and **the second track requirement**
   (two subjects from **one** CS, AI+D, or EE track). When you refer to the
   automated mapping block, call it something plain like "the course-to-requirement
   mapping from Course Compass" — never the variable-style name.
2a-topic. **What each course is about (CRITICAL — stops catalog hallucinations)**:
   For **every** course number you mention, treat that course's **Title** and
   **Description** lines in COURSE_CONTEXT as the **only** truth about content and topic.
   Do **not** describe a course using another retrieval neighbor's topics, "general
   knowledge" about the number, or patterns you assume from course IDs. If you list
   courses for a **topic** question (e.g. distributed systems), include a course **only**
   if that topic clearly appears in **that** course's Title or Description; otherwise omit it
   or say it does not match. Never label a course with a broad area (e.g. "systems") unless
   that area appears in its Description or Title.
2b. When **EECS_CIM2_SUBJECT_LIST** appears above, the student asked which subjects
   satisfy **EECS CI-M** / **CIM2** (second CI-M on newer Course 6 charts). List
   **every** subject ID from that block in a clear bullet or grouped list. Do **not**
   say you lack that list or that it is outside Course Compass — treat it as authoritative.
3. Joint listings: when a course has "Joint listings: ..." or "Meets with: ...",
   mention BOTH numbers so the user knows it can show up under either subject.
4. When PROGRESS_CONTEXT is provided, answer in terms of the actual remaining
   nodes — use the labels verbatim, group by section.
5. When TRACKS_CONTEXT is provided, use those explicit subject lists. Mention
   any sub-rule note attached to the track.
5a. **6-3 track / elective counting (CRITICAL — read MAJOR_CONTEXT; do not invent numbers)**:
   - The number and names of elective slots change by catalog year. Read the
     "Elective" / track section in MAJOR_CONTEXT literally for the active year.
   - Where the tree shows "ANY 1 of N" track options with a ⚠ note, the student
     must pick ONE named track and complete BOTH subjects from that same track
     for that requirement (e.g., two from Systems, not one Systems + one Theory).
   - The usual 6-3 pattern has TWO separate track requirements → **four** distinct
     track course enrollments minimum, unless MAJOR_CONTEXT explicitly says otherwise.
   - The **two restricted electives** (flex / EECS list; see MAJOR_CONTEXT for the allowlist) must be **separate** subjects from the four track electives and from
     **any other line** on the degree sheet (GIR, 6-3 core, etc.), except where **CI-M,
     AUS, and II** cross-cutting rules explicitly allow the same class to count on
     multiple lines.
   - Cross-cutting tags in MAJOR_CONTEXT (e.g. AUS2/grad_AUS2, CIM2, II/grad_II on
     newer charts) can overlap with electives per the chart notes — they are not
     automatically separate extra courses beyond what the tree states.
   - **Which track requirement is which (6-3):** The **first** band is **CS-only**
     (two courses from one CS thread). The **second** band is **CS, AI+D, or EE**
     (two courses from one thread in that larger set). A course on a **CS** thread
     list can count toward the first band, the second band, or both (four courses
     total). **Never** say a CS thread applies only to the second band. AI+D and EE
     threads count toward the **second** band only.
5b. **Computed course→requirement mapping (when present)**: This block is
   authoritative. (1) Under its own markdown heading, list **every** track and
   tree line shown there — do not silently drop EE threads, Hardware and Software, etc.
   (2) Your answer MUST NOT contradict that mapping (e.g. never say a course is absent
   from Independent Inquiry if the mapping lists the II / grad_II cross-cutting tag).
   (3) Use the exact cross-cutting tag titles from the requirement tree (e.g.
   "AUS2 or grad_AUS2") — do not relabel them as generic "AUS" unless the node title
   itself says AUS.
6. **Similar-courses / alternative-courses questions**: when the user asks for
   classes "similar to" / "instead of" / "alternatives to" a course, the
   COURSE_CONTEXT block ALREADY contains the referenced course AND the most
   semantically similar candidates, ordered by relevance. Your job is to:
     a. Confirm what the referenced course covers (paraphrase **only** its Title and
        Description from COURSE_CONTEXT — same rule as 2a-topic).
     b. Recommend 3-6 specific alternative courses from COURSE_CONTEXT,
        comparing each to the original (overlap in topics, prereqs, units,
        when it's offered, requirement-counting). Be concrete.
     c. Briefly note any meaningful differences (different department, harder
        prereqs, different track counting, etc.).
   Never tell the user to "browse the catalog" or "talk to an advisor" for
   this kind of question — the candidates are right there in your context.
8. **Comparison / "what-if" questions across majors** (e.g., "compare 6-3 and
   6-14", "if I switch from 6-3 to 6-14 and finished all of 6-3, how many
   extra units?"): MAJOR_CONTEXT contains the FULL requirement tree of every
   major in scope, separated by "=== NEXT MAJOR ===". This is a math problem
   you have all the inputs for. Steps:
     a. Walk both trees and identify shared subjects (a course that satisfies
        a node in both majors). Treat the GIRs as universally shared.
     b. List the requirements that are in major B but NOT in major A.
        For each one, state the unit count of the leaf (12 / 6 / 15 / etc).
     c. Sum the units. Present a side-by-side table when helpful.
     d. Be honest about ambiguity: if a 6-14 elective slot could plausibly be
        filled by a 6-3 advanced subject, say so. If a slot definitely can't
        (e.g., 14.32 Econometric Data Science has no 6-3 equivalent), say so.
   Never refuse this kind of question — it's pure math from data you have.
   Cite the source URLs of BOTH majors at the bottom.
9. If a piece of information genuinely isn't in your context, say so honestly
   ("I don't have data on X"), but only AFTER you've answered everything you
   can with the data you do have. Don't lead with the disclaimer.
10. Be thorough but well-structured. Use markdown headings and bullet lists.
   For requirement breakdowns, use H2 per major section.
11. Prefer the "Source URL:" line from the requirement tree header for each major.
   The server will strip hallucinated archive.mit.edu URLs and append the correct
   chart link(s) from loaded data if your draft omitted them.
12. **Follow-up corrections**: If the user says you missed a track or requirement,
   re-read the computed course mapping, track appendix, and requirement tree; give a
   reconciled bullet list and briefly acknowledge the fix (one sentence).

${yearContext ? `STUDENT YEAR CONTEXT:\n${yearContext}\n` : ""}
${cim2Block ? `EECS_CIM2_SUBJECT_LIST:\n${cim2Block}\n` : ""}
COURSE_CONTEXT:
${courseContext}

MAJOR_CONTEXT:
${majorBlock}

${coverageBlock ? `COURSE_REQUIREMENT_MAPPING (computed — authoritative; do not show this heading name to the user):\n${coverageBlock}\n` : ""}

${progressBlock ? `PROGRESS_CONTEXT:\n${progressBlock}` : ""}

${tracksBlock ? `TRACKS_CONTEXT:\n${tracksBlock}` : ""}`;

  const userMessages: ChatMessage[] = [
    ...args.history.slice(-10),
    { role: "user", content: args.question },
  ];

  return complete({
    system,
    model: MODEL_FAST,
    maxTokens: 2400,
    messages: userMessages,
  });
}

function expandWithJointListings(
  retrieved: Retrieved[],
  courseById: Map<string, Course>,
): Retrieved[] {
  const seen = new Set<string>();
  const out: Retrieved[] = [];
  for (const r of retrieved) {
    if (seen.has(r.course.id)) continue;
    seen.add(r.course.id);
    out.push(r);
    for (const id of [...r.course.jointSubjects, ...r.course.meetsWith]) {
      const sib = courseById.get(id);
      if (sib && !seen.has(sib.id)) {
        seen.add(sib.id);
        out.push({ course: sib, score: r.score, reason: "filter" });
      }
    }
  }
  return out;
}

function pinReferencedCourses(
  retrieved: Retrieved[],
  ids: string[],
  courseById: Map<string, Course>,
): Retrieved[] {
  const seen = new Set<string>();
  const out: Retrieved[] = [];
  // Referenced courses go first so the LLM sees them as "the thing the user
  // asked about" before the candidate alternatives.
  for (const id of ids) {
    const c = resolveCourseFromMention(id, courseById) ?? courseById.get(id);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      out.push({ course: c, score: 1, reason: "exact" });
    }
  }
  for (const r of retrieved) {
    if (seen.has(r.course.id)) continue;
    seen.add(r.course.id);
    out.push(r);
  }
  return out;
}

function formatRetrievedContext(retrieved: Retrieved[]): string {
  if (retrieved.length === 0) {
    return "(No retrieved courses match this query. Tell the user you don't have grounded information for this; recommend checking catalog.mit.edu or the EECS curriculum page.)";
  }
  return retrieved.map((r) => formatCourseSummary(r.course)).join("\n---\n");
}

function formatCourseSummary(c: Course): string {
  const offered = [
    c.offered.fall ? "Fall" : null,
    c.offered.iap ? "IAP" : null,
    c.offered.spring ? "Spring" : null,
    c.offered.summer ? "Summer" : null,
  ]
    .filter(Boolean)
    .join("/");

  const tags = [
    c.girAttribute ? `GIR=${c.girAttribute}` : null,
    c.hassAttribute ?? null,
    c.communicationRequirement ?? null,
    `${c.totalUnits} units`,
    c.level === "G" ? "Graduate" : "Undergraduate",
  ]
    .filter(Boolean)
    .join(", ");

  const joint =
    c.jointSubjects.length > 0
      ? `\n  Joint listings (same class, also numbered): ${c.jointSubjects.join(", ")}`
      : "";
  const meetsWith =
    c.meetsWith.length > 0
      ? `\n  Meets with (shared meetings, separate course numbers): ${c.meetsWith.join(", ")}`
      : "";
  const prereqs = c.prerequisitesRaw
    ? `\n  Prereqs: ${c.prerequisitesRaw}`
    : "";
  const description =
    c.description.length > 600
      ? c.description.slice(0, 600) + "…"
      : c.description;

  return `[Catalog snapshot — topics below apply ONLY to ${c.id}]
${c.id} — ${c.title}
  Tags: ${tags}
  Offered: ${offered || "TBA"}${joint}${meetsWith}${prereqs}
  Description: ${description}
  URL: ${c.catalogUrl}`;
}

function formatMajorContext(
  major: MajorRequirement,
  completedCourseIds: string[],
): string {
  const completedList =
    completedCourseIds.length > 0 ? completedCourseIds.join(", ") : "(none reported)";
  const treeLines: string[] = [];
  treeLines.push(`Header:`);
  treeLines.push(`  Major: ${major.name} (${major.id})`);
  treeLines.push(`  Catalog year: ${major.catalogYear}`);
  treeLines.push(`  Source URL: ${major.sourceUrl}`);
  if (major.notes) treeLines.push(`  Notes: ${major.notes}`);
  treeLines.push(`  Completed courses on record: ${completedList}`);
  treeLines.push("");
  treeLines.push("Requirement tree (every node listed; leaves include accepted course IDs):");
  treeLines.push("");
  walkRequirementTree(major.root, 0, treeLines);
  return treeLines.join("\n");
}

function walkRequirementTree(
  node: RequirementNode,
  depth: number,
  out: string[],
): void {
  const indent = "  ".repeat(depth);
  if (node.kind === "all") {
    out.push(`${indent}- ALL of: ${node.title}`);
    if (node.description) out.push(`${indent}    note: ${node.description}`);
    for (const c of node.children) walkRequirementTree(c, depth + 1, out);
  } else if (node.kind === "any") {
    const needed = node.needed ?? 1;
    const childCount = node.children.length;
    out.push(`${indent}- ANY ${needed} of ${childCount} options: ${node.title}`);
    if (node.description) out.push(`${indent}    ⚠ rule: ${node.description}`);
    for (const c of node.children) walkRequirementTree(c, depth + 1, out);
  } else if (node.kind === "course") {
    out.push(
      `${indent}- COURSE: ${node.title} — accepted IDs: ${node.acceptedIds.join(", ")}`,
    );
  } else if (node.kind === "tag") {
    const count = node.count ?? 1;
    const ids = node.allowedIds
      ? ` — accepted IDs: ${node.allowedIds.slice(0, 60).join(", ")}${node.allowedIds.length > 60 ? `, … (${node.allowedIds.length} total)` : ""}`
      : node.gir
        ? ` — GIR=${node.gir}`
        : node.hass
          ? ` — HASS=${node.hass}`
          : node.ci
            ? ` — CI=${node.ci}`
            : "";
    out.push(`${indent}- TAG (need ${count}): ${node.title}${ids}`);
    if (node.description) out.push(`${indent}    note: ${node.description}`);
  } else if (node.kind === "department") {
    const count = node.count ?? 1;
    out.push(
      `${indent}- DEPT (need ${count}): ${node.title} — department=${node.department}${node.minNumber ? `, min number=${node.minNumber}` : ""}${node.undergradOnly ? ", undergrad only" : ""}`,
    );
    if (node.description) out.push(`${indent}    note: ${node.description}`);
  } else if (node.kind === "units_outside_gir") {
    out.push(
      `${indent}- UNITS OUTSIDE GIR (≥${node.minUnits}): ${node.title} — node id: ${node.id}; counts units from completed subjects with no GIR tag in catalog data (approximation).`,
    );
    if (node.description) out.push(`${indent}    note: ${node.description}`);
  }
}

/**
 * Compresses a ProgressReport into a string the LLM can reason about. We
 * prefer a flat list because that's easier for an LLM to scan than a deeply
 * nested tree.
 */
function formatProgressContext(report: ProgressReport): string {
  const lines: string[] = [];
  lines.push(`Major: ${report.major.name} (${report.major.id})`);
  lines.push(`Total units logged: ${report.totalUnitsCompleted}`);
  lines.push(`Overall: ${report.isComplete ? "complete" : "in progress"}`);
  lines.push("");

  // Walk the tree depth-first and emit one line per leaf, plus headers for
  // top-level sections.
  function walk(n: NodeStatus, depth: number) {
    const isLeaf = !n.children || n.children.length === 0;
    const indent = "  ".repeat(depth);
    const stateMark =
      n.state === "complete" ? "[x]" : n.state === "partial" ? "[~]" : "[ ]";
    const candidates =
      isLeaf && n.state !== "complete" && n.candidates.length > 0
        ? `\n${indent}    candidates: ${n.candidates
            .slice(0, 6)
            .map((c) => c.id)
            .join(", ")}`
        : "";
    const satisfied =
      n.satisfiedBy.length > 0
        ? ` (satisfied by ${n.satisfiedBy.join(", ")})`
        : "";
    lines.push(
      `${indent}${stateMark} ${n.node.title} — ${n.label}${satisfied}${candidates}`,
    );
    if (n.children) {
      for (const c of n.children) walk(c, depth + 1);
    }
  }
  walk(report.root, 0);
  return lines.join("\n");
}

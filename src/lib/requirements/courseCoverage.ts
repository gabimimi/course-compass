/**
 * Deterministic "where does this course appear?" coverage for LLM grounding.
 * Lists EECS track allowlists + requirement-tree leaves that accept the course.
 */

import type { Course } from "@/lib/data/types";
import type { MajorRequirement, RequirementNode } from "@/lib/requirements/types";
import { courseMatchesDept, courseMatchesTag } from "@/lib/requirements/engine";
import { TRACKS } from "@/lib/requirements/tracks";

export function idEqual(a: string, b: string): boolean {
  return a.replace(/\s/g, "").toLowerCase() === b.replace(/\s/g, "").toLowerCase();
}

/**
 * Resolve a course mention to the corpus record. Handles casing and joint
 * listings (e.g. user says 6.C395 but FireRoad keys the row as 14.C395).
 */
export function resolveCourseFromMention(
  raw: string,
  courseById: Map<string, Course>,
): Course | undefined {
  const t = raw.trim();
  if (courseById.has(t)) return courseById.get(t);
  const low = t.toLowerCase();
  for (const c of courseById.values()) {
    if (c.id.toLowerCase() === low) return c;
    if (c.jointSubjects.some((j) => j.toLowerCase() === low)) return c;
    if (c.meetsWith.some((m) => m.toLowerCase() === low)) return c;
  }
  for (const id of courseById.keys()) {
    if (id.toLowerCase() === low) return courseById.get(id);
  }
  return undefined;
}

/** Primary catalog id for this mention (corpus row id, or original casing if unknown). */
export function resolveCanonicalCourseId(raw: string, courseById: Map<string, Course>): string {
  return resolveCourseFromMention(raw, courseById)?.id ?? raw.trim();
}

function collectIdVariants(queriedId: string, course: Course | undefined): Set<string> {
  const s = new Set<string>();
  s.add(queriedId.trim().toLowerCase());
  if (course) {
    s.add(course.id.toLowerCase());
    for (const j of course.jointSubjects) s.add(j.toLowerCase());
    for (const m of course.meetsWith) s.add(m.toLowerCase());
  }
  return s;
}

function allowlistMatchesAnyVariant(
  allowedIds: string[] | undefined,
  variants: Set<string>,
): boolean {
  if (!allowedIds?.length) return false;
  return allowedIds.some((id) => variants.has(id.toLowerCase()));
}

function tracksContaining(variants: Set<string>) {
  return TRACKS.filter((tr) =>
    tr.subjects.some((s) => variants.has(s.toLowerCase())),
  );
}

function walkTree(
  queriedId: string,
  variants: Set<string>,
  course: Course | undefined,
  node: RequirementNode,
  lines: string[],
): void {
  if (node.kind === "course") {
    if (node.acceptedIds.some((id) => [...variants].some((v) => idEqual(id, v)))) {
      lines.push(
        `  - [course] ${node.title} (node id: ${node.id}) — accepted: ${node.acceptedIds.join(", ")}`,
      );
    }
  } else if (node.kind === "tag") {
    const onAllowlist = allowlistMatchesAnyVariant(node.allowedIds, variants);
    const engineMatch = course ? courseMatchesTag(course, node) : false;
    if (onAllowlist || engineMatch) {
      const extra =
        node.allowedIds && node.allowedIds.length > 0
          ? `allowlist (${node.allowedIds.length} ids)`
          : "attribute-based tag";
      lines.push(`  - [tag] ${node.title} (node id: ${node.id}) — ${extra}`);
    }
  } else if (node.kind === "department") {
    if (course && courseMatchesDept(course, node)) {
      lines.push(`  - [department rule] ${node.title} (node id: ${node.id})`);
    }
  } else if (node.kind === "units_outside_gir") {
    if (course && !course.girAttribute) {
      lines.push(
        `  - [units outside GIR] ${node.title} (node id: ${node.id}) — counts toward ≥${node.minUnits} units if no GIR tag on catalog row`,
      );
    }
  }

  if (node.kind === "all" || node.kind === "any") {
    for (const ch of node.children) walkTree(queriedId, variants, course, ch, lines);
  }
}

/**
 * Human-readable block for the LLM. When present, answers must not contradict it.
 */
export function formatCourseRequirementCoverage(args: {
  courseIds: string[];
  majors: MajorRequirement[];
  courseById: Map<string, Course>;
  /** Catalog year the user is actually answering from (may differ from major.catalogYear on shared objects). */
  answerCatalogYear: string;
}): string {
  const { courseIds, majors, courseById, answerCatalogYear } = args;
  if (courseIds.length === 0 || majors.length === 0) return "";

  const sections: string[] = [];
  sections.push(
    "This block is COMPUTED from the same requirement trees and track tables as the app.",
    `Active catalog year for this answer: ${answerCatalogYear}`,
    "Rules:",
    "- Every track listed below includes this course ID (or a joint-listed sibling id) on the EECS track subject list in this codebase.",
    "- Tree lines describe nodes this course can satisfy (explicit id match on any joint listing, plus engine tag rules when a Course row exists).",
    "- Some tracks have pairing/sub-rules in the tracks appendix of this prompt — membership in a list is necessary but may not be sufficient.",
    "",
  );

  for (const rawId of courseIds) {
    const course = resolveCourseFromMention(rawId, courseById);
    const primaryId = course?.id ?? rawId.trim();
    const variants = collectIdVariants(rawId, course);

    for (const major of majors) {
      const tracks = tracksContaining(variants);
      const treeLines: string[] = [];
      walkTree(rawId.trim(), variants, course, major.root, treeLines);

      sections.push(`---`);
      const alternateLabels = course
        ? [...new Set([rawId.trim(), ...course.jointSubjects, ...course.meetsWith])].filter(
            (x) => x.toLowerCase() !== primaryId.toLowerCase(),
          )
        : [];
      sections.push(
        `Course (primary id in our catalog): ${primaryId}${
          alternateLabels.length
            ? ` — same subject also appears as: ${alternateLabels.join(", ")}`
            : ""
        }`,
        `Major: ${major.name} (${major.id}) — requirement object catalogYear: ${major.catalogYear}`,
      );
      sections.push("");
      sections.push("EECS tracks whose subject list includes this course:");
      if (tracks.length === 0) {
        sections.push("  (none in the track tables — not counted as a named-thread track subject here)");
      } else {
        for (const t of tracks) {
          sections.push(
            `  - ${t.id} — ${t.name} (${t.area.toUpperCase()})${t.subRulesNote ? ` — note: ${t.subRulesNote}` : ""}`,
          );
        }
      }
      if (major.id === "6-3" && tracks.length > 0) {
        const cs = tracks.filter((tr) => tr.area === "cs");
        const aid = tracks.filter((tr) => tr.area === "ai_d");
        const ee = tracks.filter((tr) => tr.area === "ee");
        const fmt = (list: typeof tracks) =>
          list.map((t) => `${t.name} (${t.id})`).join("; ") || "(none)";
        sections.push("");
        sections.push(
          "How these threads relate to the TWO 6-3 elective track requirements (authoritative wording — do not contradict):",
        );
        sections.push(
          `  - **First requirement — two subjects from ONE CS track:** among threads that include this course, only **area=CS** threads count here → ${fmt(cs)}`,
        );
        sections.push(
          `  - **Second requirement — two subjects from ONE CS, AI+D, or EE track:** any thread with **area=CS, AI+D, or EE** that includes this course → ${fmt([...cs, ...aid, ...ee])}`,
        );
        sections.push(
          "  - A **CS** thread can satisfy the first requirement, the second requirement, or **both** (still four distinct course enrollments for the two track bands). Do **not** tell the student that CS threads only apply to the second requirement.",
        );
        sections.push(
          "  - **AI+D** or **EE** threads that include this course can satisfy the **second** requirement only (not the CS-only first requirement).",
        );
        sections.push("");
      }
      sections.push("Requirement tree nodes this course matches (may satisfy these slots):");
      if (treeLines.length === 0) {
        sections.push(
          "  (no explicit course/tag-allowlist/department-rule hits; may still count toward GIRs or other catalog rules outside this tree.)",
        );
      } else {
        sections.push(...treeLines);
      }
      sections.push("");
    }
  }

  return sections.join("\n");
}

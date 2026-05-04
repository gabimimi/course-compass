/**
 * Requirement evaluation engine.
 *
 * Given a major, a set of completed course IDs, and the full Course corpus,
 * compute which requirement nodes are satisfied, partial, or open, and what
 * candidate courses could satisfy each open node.
 */

import type { Course } from "@/lib/data/types";
import type {
  AllNode,
  AnyNode,
  CourseNode,
  DepartmentNode,
  MajorRequirement,
  RequirementNode,
  TagNode,
} from "@/lib/requirements/types";
import { COMMUNICATION_INTENSIVE_IN_MAJOR_SUBJECTS } from "@/lib/requirements/groupings";

// Pre-built sets from groupings for O(1) attribute injection
const CIM_SET = new Set(COMMUNICATION_INTENSIVE_IN_MAJOR_SUBJECTS);

export interface NodeStatus {
  node: RequirementNode;
  /** Course ids that contributed to satisfying this node. */
  satisfiedBy: string[];
  /** Total units satisfied so far. */
  unitsSatisfied: number;
  /** "complete" | "partial" | "open" */
  state: "complete" | "partial" | "open";
  /** Per-child statuses for aggregator nodes. */
  children?: NodeStatus[];
  /** A capped list of candidate courses that could help close this node. */
  candidates: Course[];
  /** Reason / human-readable progress label. */
  label: string;
}

export interface ProgressReport {
  major: MajorRequirement;
  completed: string[];
  totalUnitsCompleted: number;
  root: NodeStatus;
  /** Flat list of all leaf statuses for easier rendering. */
  leaves: NodeStatus[];
  /** True if the major is fully satisfied. */
  isComplete: boolean;
}

const MAX_CANDIDATES = 6;

/**
 * Evaluates a major's requirements against the user's completed courses.
 * @param major Major requirement tree.
 * @param completedIds Set of completed course IDs (e.g., ["6.1010","18.06"]).
 * @param corpus All courses available for candidate suggestions.
 */
export function evaluateMajor(
  major: MajorRequirement,
  completedIds: string[],
  corpus: Course[],
  overriddenRequirementIds: Set<string> = new Set(),
  manualAssignments: Map<string, string[]> = new Map(),
): ProgressReport {
  const courseById = new Map<string, Course>();
  for (const c of corpus) courseById.set(c.id, c);

  // Hard-coded equivalencies: pairs that FireRoad doesn't link via
  // joint_subjects but that MIT treats as the same subject for requirement
  // purposes. Format: each inner array is a group of interchangeable IDs.
  const KNOWN_EQUIVALENCIES: string[][] = [
    ["6.1903", "6.1904"], // Same content; 6.1903 = regular term, 6.1904 = IAP
  ];
  const equivMap = new Map<string, string[]>();
  for (const group of KNOWN_EQUIVALENCIES) {
    for (const id of group) equivMap.set(id, group);
  }

  // Expand the completed set with every joint / meets-with sibling AND
  // known equivalency of each completed course. This handles:
  //   - 6.1903 ↔ 6.1904 (same class in different terms, no joint link)
  //   - 6.SXX special subjects joint-listed with the canonical version
  const expandedCompleted = new Set<string>(completedIds);
  for (const id of completedIds) {
    const c = courseById.get(id);
    if (c) {
      for (const sid of [...c.jointSubjects, ...c.meetsWith]) {
        expandedCompleted.add(sid);
      }
    }
    const equiv = equivMap.get(id);
    if (equiv) {
      for (const eid of equiv) expandedCompleted.add(eid);
    }
  }

  // Build enriched course records: if a course in the corpus has missing
  // attributes (CI, HASS, GIR) but one of its joint siblings has them,
  // inherit those attributes. This fixes 6.S* specials where FireRoad
  // stores a generic placeholder record with no CI-M / HASS tags.
  const enrichedById = new Map<string, Course>(courseById);
  for (const c of corpus) {
    if (c.jointSubjects.length === 0) continue;
    for (const sibId of c.jointSubjects) {
      const sib = courseById.get(sibId);
      if (!sib) continue;
      // Propagate any attribute that c is missing but sib has.
      const updated: Course = { ...c };
      let changed = false;
      if (!updated.communicationRequirement && sib.communicationRequirement) {
        updated.communicationRequirement = sib.communicationRequirement;
        changed = true;
      }
      if (!updated.hassAttribute && sib.hassAttribute) {
        updated.hassAttribute = sib.hassAttribute;
        changed = true;
      }
      if (!updated.girAttribute && sib.girAttribute) {
        updated.girAttribute = sib.girAttribute;
        changed = true;
      }
      if (changed) enrichedById.set(c.id, updated);
    }
  }

  // For courses the student completed that have no attributes but whose
  // siblings DO — also enrich in the other direction (sib → original).
  for (const id of completedIds) {
    const c = enrichedById.get(id);
    if (!c) continue;
    if (c.communicationRequirement && c.hassAttribute && c.girAttribute) continue;
    for (const sibId of [...c.jointSubjects, ...c.meetsWith]) {
      const sib = enrichedById.get(sibId);
      if (!sib) continue;
      const updated: Course = { ...c };
      let changed = false;
      if (!updated.communicationRequirement && sib.communicationRequirement) {
        updated.communicationRequirement = sib.communicationRequirement;
        changed = true;
      }
      if (!updated.hassAttribute && sib.hassAttribute) {
        updated.hassAttribute = sib.hassAttribute;
        changed = true;
      }
      if (!updated.girAttribute && sib.girAttribute) {
        updated.girAttribute = sib.girAttribute;
        changed = true;
      }
      if (changed) enrichedById.set(id, updated);
    }
  }

  // Inject CI-M attribute for all known CI-M subjects that FireRoad
  // doesn't mark (FireRoad stores zero CI-M records for Course 6).
  // Apply to every course in enrichedById that's in our curated list.
  for (const [id, c] of enrichedById) {
    if (CIM_SET.has(id) && !c.communicationRequirement) {
      enrichedById.set(id, { ...c, communicationRequirement: "CI-M" });
    }
  }
  // Also cover any completed courses that might not be in the corpus
  // (e.g., 6.S* special subjects not fetched or manually added).
  for (const id of expandedCompleted) {
    if (!CIM_SET.has(id)) continue;
    const existing = enrichedById.get(id);
    if (existing && !existing.communicationRequirement) {
      enrichedById.set(id, { ...existing, communicationRequirement: "CI-M" });
    }
  }

  const totalUnits = completedIds.reduce(
    (sum, id) => sum + (enrichedById.get(id)?.totalUnits ?? 0),
    0,
  );

  // Add manually-assigned courses to the expandedCompleted set so the engine
  // can find them, then store the mapping in context for use in evalNode.
  for (const courses of manualAssignments.values()) {
    for (const id of courses) expandedCompleted.add(id);
  }

  const ctx: EvalContext = {
    completedSet: expandedCompleted,
    courseById: enrichedById,
    corpus,
    overriddenRequirementIds,
    manualAssignments,
  };
  const root = evalNode(major.root, ctx);

  const leaves: NodeStatus[] = [];
  collectLeaves(root, leaves);

  return {
    major,
    completed: [...completedIds],
    totalUnitsCompleted: totalUnits,
    root,
    leaves,
    isComplete: root.state === "complete",
  };
}

interface EvalContext {
  completedSet: Set<string>;
  courseById: Map<string, Course>;
  corpus: Course[];
  overriddenRequirementIds: Set<string>;
  /** Maps requirement node IDs to courses the user manually assigned to them. */
  manualAssignments: Map<string, string[]>;
}

function evalNode(node: RequirementNode, ctx: EvalContext): NodeStatus {
  // Manual override: user explicitly checked this requirement as satisfied.
  if (ctx.overriddenRequirementIds.has(node.id)) {
    return {
      node,
      satisfiedBy: [],
      unitsSatisfied: 0,
      state: "complete",
      candidates: [],
      label: "Manually marked complete",
    };
  }

  // Manual course assignment: user pinned specific course(s) to satisfy this
  // requirement slot. If any of those courses are in the completed set, treat
  // the node as complete and show the assigned course as the satisfier.
  const assigned = ctx.manualAssignments.get(node.id);
  if (assigned && assigned.length > 0) {
    const satisfied = assigned.filter((id) => ctx.completedSet.has(id));
    if (satisfied.length > 0) {
      const course = ctx.courseById.get(satisfied[0]);
      return {
        node,
        satisfiedBy: satisfied,
        unitsSatisfied: course?.totalUnits ?? 12,
        state: "complete",
        candidates: [],
        label: `Manually assigned: ${satisfied.join(", ")}`,
      };
    }
  }

  switch (node.kind) {
    case "all":
      return evalAll(node, ctx);
    case "any":
      return evalAny(node, ctx);
    case "course":
      return evalCourse(node, ctx);
    case "tag":
      return evalTag(node, ctx);
    case "department":
      return evalDepartment(node, ctx);
  }
}

function evalAll(node: AllNode, ctx: EvalContext): NodeStatus {
  const children = node.children.map((c) => evalNode(c, ctx));
  const totalUnits = children.reduce((s, c) => s + c.unitsSatisfied, 0);
  const allComplete = children.every((c) => c.state === "complete");
  const anyProgress =
    !allComplete &&
    children.some((c) => c.state === "complete" || c.state === "partial");

  let state: NodeStatus["state"];
  if (allComplete && (!node.minUnits || totalUnits >= node.minUnits)) {
    state = "complete";
  } else if (anyProgress || totalUnits > 0) {
    state = "partial";
  } else {
    state = "open";
  }

  const completedCount = children.filter((c) => c.state === "complete").length;
  const label = `${completedCount}/${children.length} sub-requirements complete`;

  const satisfiedBy = uniq(children.flatMap((c) => c.satisfiedBy));
  return {
    node,
    satisfiedBy,
    unitsSatisfied: totalUnits,
    state,
    children,
    candidates: [],
    label,
  };
}

function evalAny(node: AnyNode, ctx: EvalContext): NodeStatus {
  const needed = node.needed ?? 1;
  const children = node.children.map((c) => evalNode(c, ctx));
  const completedChildren = children.filter((c) => c.state === "complete");
  const totalUnits = completedChildren.reduce(
    (s, c) => s + c.unitsSatisfied,
    0,
  );
  const enoughChildren = completedChildren.length >= needed;
  const enoughUnits = !node.minUnits || totalUnits >= node.minUnits;

  let state: NodeStatus["state"];
  if (enoughChildren && enoughUnits) state = "complete";
  else if (completedChildren.length > 0 || totalUnits > 0) state = "partial";
  else state = "open";

  // Aggregate candidates from open children, capped.
  const candidates = uniqByCourseId(
    children
      .filter((c) => c.state !== "complete")
      .flatMap((c) => c.candidates),
  ).slice(0, MAX_CANDIDATES);

  const label = `${completedChildren.length}/${needed} option${needed === 1 ? "" : "s"} satisfied`;

  return {
    node,
    satisfiedBy: completedChildren.flatMap((c) => c.satisfiedBy),
    unitsSatisfied: totalUnits,
    state,
    children,
    candidates,
    label,
  };
}

function evalCourse(node: CourseNode, ctx: EvalContext): NodeStatus {
  const matched = node.acceptedIds.find((id) =>
    [...ctx.completedSet].some((done) => done.toLowerCase() === id.toLowerCase()),
  );
  const canonical = ctx.courseById.get(node.acceptedIds[0]);
  if (matched) {
    const c = ctx.courseById.get(matched);
    return {
      node,
      satisfiedBy: [matched],
      unitsSatisfied: c?.totalUnits ?? 0,
      state: "complete",
      candidates: [],
      label: `Satisfied by ${matched}`,
    };
  }
  // Candidates are the accepted courses themselves.
  const candidates = node.acceptedIds
    .map((id) => ctx.courseById.get(id))
    .filter((c): c is Course => c !== undefined);
  return {
    node,
    satisfiedBy: [],
    unitsSatisfied: 0,
    state: "open",
    candidates,
    label: canonical
      ? `Take ${canonical.id}: ${canonical.title}`
      : "Open requirement",
  };
}

function evalTag(node: TagNode, ctx: EvalContext): NodeStatus {
  const need = node.count ?? 1;
  const minUnits = node.minUnits;

  // Determine which completed courses match this tag.
  const matches = [...ctx.completedSet]
    .map((id) => ctx.courseById.get(id))
    .filter((c): c is Course => c !== undefined)
    .filter((c) => courseMatchesTag(c, node));

  const matchCount = matches.length;
  const matchUnits = matches.reduce((s, c) => s + c.totalUnits, 0);

  let state: NodeStatus["state"];
  if (matchCount >= need && (!minUnits || matchUnits >= minUnits)) {
    state = "complete";
  } else if (matchCount > 0 || matchUnits > 0) {
    state = "partial";
  } else {
    state = "open";
  }

  // Candidate courses to suggest: highest-rated unconsumed matches in corpus.
  const consumed = new Set(matches.map((c) => c.id));
  const candidates = ctx.corpus
    .filter((c) => !consumed.has(c.id))
    .filter((c) => courseMatchesTag(c, node))
    .filter((c) => !ctx.completedSet.has(c.id))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, MAX_CANDIDATES);

  const label = `${matchCount}/${need} satisfied${
    minUnits ? ` (${matchUnits}/${minUnits} units)` : ""
  }`;

  return {
    node,
    satisfiedBy: matches.map((c) => c.id),
    unitsSatisfied: matchUnits,
    state,
    candidates,
    label,
  };
}

export function courseMatchesTag(c: Course, node: TagNode): boolean {
  if (
    node.allowedIds &&
    !node.allowedIds.some((id) => id.toLowerCase() === c.id.toLowerCase())
  )
    return false;
  if (node.departmentEquals && c.department !== node.departmentEquals) return false;
  if (node.gir && c.girAttribute !== node.gir) return false;
  if (node.hass) {
    // "HASS" (no specific area) matches any HASS-A / HASS-S / HASS-H course.
    if (node.hass === "HASS") {
      if (!c.hassAttribute) return false;
    } else if (c.hassAttribute !== node.hass) {
      return false;
    }
  }
  if (node.ci) {
    // CI-H tag should match CI-H or CI-HW.
    if (node.ci === "CI-H") {
      if (c.communicationRequirement !== "CI-H" && c.communicationRequirement !== "CI-HW")
        return false;
    } else if (c.communicationRequirement !== node.ci) {
      return false;
    }
  }
  return true;
}

function evalDepartment(node: DepartmentNode, ctx: EvalContext): NodeStatus {
  const need = node.count ?? 1;
  const minUnits = node.minUnits;

  const matches = [...ctx.completedSet]
    .map((id) => ctx.courseById.get(id))
    .filter((c): c is Course => c !== undefined)
    .filter((c) => courseMatchesDept(c, node));

  const matchCount = matches.length;
  const matchUnits = matches.reduce((s, c) => s + c.totalUnits, 0);

  let state: NodeStatus["state"];
  if (matchCount >= need && (!minUnits || matchUnits >= minUnits)) {
    state = "complete";
  } else if (matchCount > 0 || matchUnits > 0) {
    state = "partial";
  } else {
    state = "open";
  }

  const consumed = new Set(matches.map((c) => c.id));
  const candidates = ctx.corpus
    .filter((c) => !consumed.has(c.id))
    .filter((c) => courseMatchesDept(c, node))
    .filter((c) => !ctx.completedSet.has(c.id))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, MAX_CANDIDATES);

  const label = `${matchCount}/${need} satisfied${
    minUnits ? ` (${matchUnits}/${minUnits} units)` : ""
  }`;

  return {
    node,
    satisfiedBy: matches.map((c) => c.id),
    unitsSatisfied: matchUnits,
    state,
    candidates,
    label,
  };
}

export function courseMatchesDept(c: Course, node: DepartmentNode): boolean {
  if (c.department !== node.department) return false;
  if (node.undergradOnly && c.level !== "U") return false;
  if (
    node.allowedIds &&
    !node.allowedIds.some((id) => id.toLowerCase() === c.id.toLowerCase())
  )
    return false;
  if (
    node.excludedIds &&
    node.excludedIds.some((id) => id.toLowerCase() === c.id.toLowerCase())
  )
    return false;
  if (node.minNumber || node.maxNumber) {
    const numStr = c.id.split(".")[1] ?? "";
    const num = parseInt(numStr.replace(/[^0-9]/g, ""), 10);
    if (Number.isNaN(num)) return false;
    if (node.minNumber && num < node.minNumber) return false;
    if (node.maxNumber && num > node.maxNumber) return false;
  }
  return true;
}

function collectLeaves(s: NodeStatus, out: NodeStatus[]) {
  if (!s.children || s.children.length === 0) {
    out.push(s);
    return;
  }
  for (const c of s.children) collectLeaves(c, out);
}

function uniq(arr: string[]): string[] {
  return [...new Set(arr)];
}

function uniqByCourseId(courses: Course[]): Course[] {
  const seen = new Set<string>();
  const out: Course[] = [];
  for (const c of courses) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

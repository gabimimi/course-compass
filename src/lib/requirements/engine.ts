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
  UnitsOutsideGirNode,
} from "@/lib/requirements/types";
import { COMMUNICATION_INTENSIVE_IN_MAJOR_SUBJECTS } from "@/lib/requirements/groupings";

/** 6-3: subjects listed under both CS core and track elective rows cannot double-count on the chart. */
const E63_CS_ROOT_ID = "6-3.cs";
const E63_TRACK_PREFIXES = ["6-3.electives.cs1", "6-3.electives.cs_aid_ee"] as const;
const MAX_OVERLAP_ENUM_BITS = 14;

// Pre-built sets from groupings for O(1) attribute injection
const CIM_SET = new Set(COMMUNICATION_INTENSIVE_IN_MAJOR_SUBJECTS);

/** 6-3 restricted-electives row (`6-3.electives.flex`): tag or department node, same id. */
const RESTRICTED_FLEX_NODE_ID = "6-3.electives.flex";

/**
 * Elective cross-cutting rows whose satisfied courses are **not** treated as
 * “consuming” the restricted elective (chart allows CI-M / AUS / II overlap).
 */
const FLEX_CROSS_CUTTING_NODE_IDS = new Set([
  "6-3.electives.aus2",
  "6-3.electives.cim2",
  "6-3.electives.ii",
  "6-3.electives.aus",
]);

function treeUsesRestrictedElectiveRule(node: RequirementNode): boolean {
  if (node.kind === "all" && node.restrictedElectiveRule) return true;
  if (node.kind === "all" || node.kind === "any") {
    return node.children.some(treeUsesRestrictedElectiveRule);
  }
  return false;
}

/** DFS: every satisfied course id except cross-cutting elective tags (and implicitly flex). */
function collectSatisfiedIdsForRestrictedFlexPreExcluded(
  status: NodeStatus,
): Set<string> {
  const out = new Set<string>();
  function walk(s: NodeStatus) {
    if (
      !FLEX_CROSS_CUTTING_NODE_IDS.has(s.node.id) &&
      s.node.id !== RESTRICTED_FLEX_NODE_ID
    ) {
      for (const id of s.satisfiedBy) out.add(id);
    }
    if (s.children) for (const ch of s.children) walk(ch);
  }
  walk(status);
  return out;
}

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

function courseIdReserved(reserved: Set<string> | undefined, courseId: string): boolean {
  if (!reserved?.size) return false;
  return reserved.has(courseId.toLowerCase());
}

function addReservedIds(target: Set<string>, ids: Iterable<string>): void {
  for (const id of ids) target.add(id.toLowerCase());
}

/** Every subject id listed on any node in this subtree (partial + complete). */
function collectDescendantSatisfiedByIds(status: NodeStatus): Set<string> {
  const out = new Set<string>();
  function walk(s: NodeStatus) {
    addReservedIds(out, s.satisfiedBy);
    if (s.children) for (const ch of s.children) walk(ch);
  }
  walk(status);
  return out;
}

function findNodeById(root: RequirementNode, targetId: string): RequirementNode | null {
  if (root.id === targetId) return root;
  if (root.kind === "all" || root.kind === "any") {
    for (const ch of root.children) {
      const f = findNodeById(ch, targetId);
      if (f) return f;
    }
  }
  return null;
}

function collectExplicitSubjectIds(node: RequirementNode): Set<string> {
  const out = new Set<string>();
  function walk(n: RequirementNode) {
    if (n.kind === "course") {
      for (const id of n.acceptedIds) out.add(id.toLowerCase());
    } else if (n.kind === "tag" && n.allowedIds) {
      for (const id of n.allowedIds) out.add(id.toLowerCase());
    } else if (n.kind === "department" && n.allowedIds) {
      for (const id of n.allowedIds) out.add(id.toLowerCase());
    }
    if (n.kind === "all" || n.kind === "any") {
      for (const c of n.children) walk(c);
    }
  }
  walk(node);
  return out;
}

/** Subject ids that appear on both CS core and track-elective sections (same catalog row cannot satisfy both). */
function compute63CoreTrackOverlapLower(root: RequirementNode): Set<string> | null {
  const cs = findNodeById(root, E63_CS_ROOT_ID);
  const electives = findNodeById(root, "6-3.electives");
  if (!cs || !electives || electives.kind !== "all") return null;
  const t1 = findNodeById(electives, "6-3.electives.cs1");
  const t2 = findNodeById(electives, "6-3.electives.cs_aid_ee");
  if (!t1 || !t2) return null;
  const a = collectExplicitSubjectIds(cs);
  const b = new Set<string>();
  for (const x of collectExplicitSubjectIds(t1)) b.add(x);
  for (const x of collectExplicitSubjectIds(t2)) b.add(x);
  const inter = new Set<string>();
  for (const x of a) {
    if (b.has(x)) inter.add(x);
  }
  return inter;
}

/**
 * Joint listings + known equivalency groups: one "logical" subject may appear
 * as multiple IDs in expandedCompleted — allocation must move the whole cluster.
 */
function expandJointEquivalentCluster(
  seeds: Iterable<string>,
  expandedCompleted: Set<string>,
  courseById: Map<string, Course>,
  knownEquiv: string[][],
): Set<string> {
  const out = new Set<string>();
  for (const s of seeds) {
    if (expandedCompleted.has(s)) out.add(s);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...out]) {
      const c = courseById.get(id);
      if (c) {
        for (const s of [...c.jointSubjects, ...c.meetsWith]) {
          if (expandedCompleted.has(s) && !out.has(s)) {
            out.add(s);
            changed = true;
          }
        }
      }
    }
    // Symmetric closure: any completed course that joint-lists something already in the cluster.
    for (const c of courseById.values()) {
      if (!expandedCompleted.has(c.id) || out.has(c.id)) continue;
      const links = [...c.jointSubjects, ...c.meetsWith];
      if (links.some((j) => out.has(j))) {
        out.add(c.id);
        changed = true;
      }
    }
    for (const group of knownEquiv) {
      const hit = group.some((g) =>
        [...out].some((o) => o.toLowerCase() === g.toLowerCase()),
      );
      if (hit) {
        for (const g of group) {
          if (expandedCompleted.has(g) && !out.has(g)) {
            out.add(g);
            changed = true;
          }
        }
      }
    }
  }
  return out;
}

/** One cluster per logical subject that appears in both core and track lists. */
function buildOverlapClusters(
  expandedCompleted: Set<string>,
  overlapLower: Set<string>,
  courseById: Map<string, Course>,
  knownEquiv: string[][],
): string[][] {
  const used = new Set<string>();
  const clusters: string[][] = [];
  for (const id of expandedCompleted) {
    const k = id.toLowerCase();
    if (!overlapLower.has(k) || used.has(k)) continue;
    const cluster = [
      ...expandJointEquivalentCluster([id], expandedCompleted, courseById, knownEquiv),
    ];
    for (const x of cluster) used.add(x.toLowerCase());
    clusters.push(cluster);
  }
  clusters.sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));
  return clusters;
}

function buildAllocationSplit(
  expandedCompleted: Set<string>,
  overlapClusters: string[][],
  mask: number,
): { forCore: Set<string>; forTrack: Set<string> } {
  const forCore = new Set(expandedCompleted);
  const forTrack = new Set(expandedCompleted);
  for (let i = 0; i < overlapClusters.length; i++) {
    const cluster = overlapClusters[i]!;
    const toCore = !!(mask & (1 << i));
    for (const id of cluster) {
      if (toCore) forTrack.delete(id);
      else forCore.delete(id);
    }
  }
  return { forCore, forTrack };
}

/** Mirrors progress page slot counting — maximize completed slots, then major complete, then fill ratio. */
function scoreProgressSlots(node: NodeStatus): { c: number; t: number } {
  const kind = node.node.kind;
  const children = node.children ?? [];

  if (
    children.length === 0 ||
    kind === "course" ||
    kind === "tag" ||
    kind === "department"
  ) {
    return { c: node.state === "complete" ? 1 : 0, t: 1 };
  }

  if (kind === "any") {
    const needed = (node.node as AnyNode).needed ?? 1;
    const done = Math.min(
      children.filter((ch) => ch.state === "complete").length,
      needed,
    );
    return { c: done, t: needed };
  }

  return children.reduce(
    (acc, ch) => {
      const r = scoreProgressSlots(ch);
      return { c: acc.c + r.c, t: acc.t + r.t };
    },
    { c: 0, t: 0 },
  );
}

function scoreReport(root: NodeStatus): [number, number, number] {
  const { c, t } = scoreProgressSlots(root);
  const ratio = t > 0 ? c / t : 0;
  const complete = root.state === "complete" ? 1 : 0;
  return [c, complete, ratio];
}

function betterScore(a: [number, number, number], b: [number, number, number]): boolean {
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] > b[2];
}

/** Same subject id cannot count toward both 6-3 CS core and track-elective rows (complete leaves only). */
function e63CoreTrackXorViolation(root: NodeStatus): boolean {
  const cs = new Set<string>();
  const tr = new Set<string>();
  function walk(s: NodeStatus) {
    if (s.children?.length) {
      for (const c of s.children) walk(c);
      return;
    }
    if (s.state !== "complete" || s.satisfiedBy.length === 0) return;
    const ids = s.satisfiedBy.map((x) => x.toLowerCase());
    const nid = s.node.id;
    if (nid === E63_CS_ROOT_ID || nid.startsWith(`${E63_CS_ROOT_ID}.`)) {
      for (const x of ids) cs.add(x);
    }
    if (E63_TRACK_PREFIXES.some((p) => nid === p || nid.startsWith(`${p}.`))) {
      for (const x of ids) tr.add(x);
    }
  }
  walk(root);
  for (const x of cs) if (tr.has(x)) return true;
  return false;
}

interface ScoredRoot {
  tuple: [number, number, number];
  xorOk: boolean;
}

function betterScoredRoot(a: ScoredRoot, b: ScoredRoot): boolean {
  if (a.xorOk !== b.xorOk) return a.xorOk;
  return betterScore(a.tuple, b.tuple);
}

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
  manualAssignments: Map<string, string[]> | Record<string, string[]> = new Map(),
): ProgressReport {
  const courseById = new Map<string, Course>();
  for (const c of corpus) courseById.set(c.id, c);

  const manualMap: Map<string, string[]> =
    manualAssignments instanceof Map
      ? manualAssignments
      : new Map(
          Object.entries(manualAssignments as Record<string, string[]>).filter(([, v]) =>
            Array.isArray(v),
          ),
        );

  // Hard-coded equivalencies: pairs that FireRoad doesn't link via
  // joint_subjects but that MIT treats as the same subject for requirement
  // purposes. Format: each inner array is a group of interchangeable IDs.
  const KNOWN_EQUIVALENCIES: string[][] = [
    ["6.1903", "6.1904"], // Same content; 6.1903 = regular term, 6.1904 = IAP
    // FireRoad often omits joint_subjects; catalog treats these as the same offering.
    ["6.1800", "6.033"],
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
  for (const courses of manualMap.values()) {
    for (const id of courses) expandedCompleted.add(id);
  }

  const baseCtx: EvalContext = {
    completedSet: expandedCompleted,
    courseById: enrichedById,
    corpus,
    overriddenRequirementIds,
    manualAssignments: manualMap,
    userCompletedIds: completedIds,
  };

  let root: NodeStatus;

  const overlapLower = compute63CoreTrackOverlapLower(major.root);
  const overlapClusters =
    major.id === "6-3" && overlapLower && overlapLower.size > 0
      ? buildOverlapClusters(expandedCompleted, overlapLower, enrichedById, KNOWN_EQUIVALENCIES)
      : [];

  /**
   * Chart rule: a subject cannot count toward both CS core and a track row.
   * We always run mask search when there is any overlapping subject, and we
   * prefer schedules with no core∩track double-use (scoring), not "max slots
   * at all costs" (which would reward double-counting when allocation is off).
   */
  const shouldAllocate6_3 = major.id === "6-3" && overlapClusters.length > 0;

  if (shouldAllocate6_3 && overlapClusters.length <= MAX_OVERLAP_ENUM_BITS) {
    let bestRoot: NodeStatus | null = null;
    let best: ScoredRoot | null = null;
    const nMasks = 1 << overlapClusters.length;
    for (let mask = 0; mask < nMasks; mask++) {
      const split = buildAllocationSplit(expandedCompleted, overlapClusters, mask);
      const r = evaluateRoot(major, { ...baseCtx, allocationSplit: split });
      const tuple = scoreReport(r);
      const xorOk = !e63CoreTrackXorViolation(r);
      const candidate = { tuple, xorOk };
      if (!best || betterScoredRoot(candidate, best)) {
        best = candidate;
        bestRoot = r;
      }
    }
    root = bestRoot!;
  } else if (shouldAllocate6_3 && overlapClusters.length > MAX_OVERLAP_ENUM_BITS) {
    let bestRoot: NodeStatus | null = null;
    let best: ScoredRoot | null = null;
    let allCoreMask = 0;
    for (let i = 0; i < overlapClusters.length; i++) allCoreMask |= 1 << i;
    for (const mask of [0, allCoreMask]) {
      const split = buildAllocationSplit(expandedCompleted, overlapClusters, mask);
      const r = evaluateRoot(major, { ...baseCtx, allocationSplit: split });
      const tuple = scoreReport(r);
      const xorOk = !e63CoreTrackXorViolation(r);
      const candidate = { tuple, xorOk };
      if (!best || betterScoredRoot(candidate, best)) {
        best = candidate;
        bestRoot = r;
      }
    }
    root = bestRoot!;
  } else {
    root = evaluateRoot(major, baseCtx);
  }

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
  /**
   * First evaluation pass: skip real flex matching so we can collect which
   * courses satisfied every other line for {@link restrictedElectivePreExcluded}.
   */
  suppressRestrictedFlexEvaluation?: boolean;
  /**
   * Course IDs already satisfied on some other requirement line (from pass 1),
   * minus cross-cutting AUS/CIM/II nodes. Merged into flex exclusion in pass 2.
   */
  restrictedElectivePreExcluded?: Set<string>;
  /**
   * Final exclusion set while evaluating the flex child: track electives ∪
   * {@link restrictedElectivePreExcluded}.
   */
  restrictedElectiveExcludeIds?: Set<string>;
  /**
   * Course IDs already allocated to earlier siblings of an {@link AllNode} with
   * {@link AllNode.childrenAllocateDistinctCourses}.
   */
  reservedForAll?: Set<string>;
  /**
   * For 6-3 only: CS core vs track-elective subtrees use disjoint subsets of
   * completed courses so a subject cannot satisfy both (chart single-count rule).
   */
  allocationSplit?: {
    forCore: Set<string>;
    forTrack: Set<string>;
  };
  /**
   * User-provided completed course list (deduped per id in evalUnitsOutsideGir).
   * Do not use `completedSet` for unit totals — it includes joint/equivalency expansion.
   */
  userCompletedIds: string[];
}

function evaluateRoot(major: MajorRequirement, baseCtx: EvalContext): NodeStatus {
  if (treeUsesRestrictedElectiveRule(major.root)) {
    const pass1Root = evalNode(major.root, {
      ...baseCtx,
      suppressRestrictedFlexEvaluation: true,
    });
    const preExcluded =
      collectSatisfiedIdsForRestrictedFlexPreExcluded(pass1Root);
    return evalNode(major.root, {
      ...baseCtx,
      restrictedElectivePreExcluded: preExcluded,
    });
  }
  return evalNode(major.root, baseCtx);
}

function effectiveLeafCompletedSet(node: RequirementNode, ctx: EvalContext): Set<string> {
  const split = ctx.allocationSplit;
  if (!split) return ctx.completedSet;
  const id = node.id;
  if (id === E63_CS_ROOT_ID || id.startsWith(`${E63_CS_ROOT_ID}.`)) {
    return split.forCore;
  }
  for (const p of E63_TRACK_PREFIXES) {
    if (id === p || id.startsWith(`${p}.`)) return split.forTrack;
  }
  return ctx.completedSet;
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

  // Manual course assignment shortcut — **only** for `course` leaves (one slot =
  // pick among accepted ids / special subjects). Do **not** use this for `tag`
  // or `department` nodes: those may need count>1 or minUnits, and the shortcut
  // treated “any one pinned course” as fully satisfied. Aggregators (`any` /
  // `all`) must always defer to child evaluation + needed counts.
  const assigned = ctx.manualAssignments.get(node.id);
  if (node.kind === "course" && assigned && assigned.length > 0) {
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
    case "units_outside_gir":
      return evalUnitsOutsideGir(node, ctx);
  }
}

function evalAll(node: AllNode, ctx: EvalContext): NodeStatus {
  let children: NodeStatus[];
  if (node.restrictedElectiveRule) {
    children = evalAllWithRestrictedElective(node, ctx);
  } else if (node.childrenAllocateDistinctCourses) {
    const reserved = new Set<string>();
    addReservedIds(reserved, ctx.reservedForAll ?? []);
    children = [];
    for (const c of node.children) {
      const s = evalNode(c, { ...ctx, reservedForAll: reserved });
      children.push(s);
      addReservedIds(reserved, collectDescendantSatisfiedByIds(s));
    }
  } else {
    children = node.children.map((c) => evalNode(c, ctx));
  }
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

/** Evaluate track electives first so the restricted elective flex slot can exclude those courses.
 * Also: successive `consumeFromChildIds` rows (6-3 cs1 vs cs_aid_ee) cannot reuse subjects — four distinct track courses total per chart.
 */
function evalAllWithRestrictedElective(
  node: AllNode,
  ctx: EvalContext,
): NodeStatus[] {
  const rule = node.restrictedElectiveRule!;
  const n = node.children.length;
  const childStatuses: NodeStatus[] = new Array(n);
  const consumed = new Set<string>();

  const reserveAcrossPriorConsumeRows = new Set<string>();
  addReservedIds(reserveAcrossPriorConsumeRows, ctx.reservedForAll ?? []);

  for (const cid of rule.consumeFromChildIds) {
    const i = node.children.findIndex((c) => c.id === cid);
    if (i === -1) continue;
    childStatuses[i] = evalNode(node.children[i], {
      ...ctx,
      reservedForAll: new Set(reserveAcrossPriorConsumeRows),
    });
    addReservedIds(reserveAcrossPriorConsumeRows, collectDescendantSatisfiedByIds(childStatuses[i]!));
    for (const id of collectDescendantSatisfiedByIds(childStatuses[i]!)) {
      consumed.add(id);
    }
  }

  for (const id of ctx.restrictedElectivePreExcluded ?? []) {
    consumed.add(id);
  }

  const flexI = node.children.findIndex((c) => c.id === rule.flexChildId);
  if (flexI !== -1) {
    childStatuses[flexI] = evalNode(node.children[flexI], {
      ...ctx,
      restrictedElectiveExcludeIds: consumed,
    });
  }

  for (let i = 0; i < n; i++) {
    if (childStatuses[i]) continue;
    childStatuses[i] = evalNode(node.children[i], ctx);
  }

  return childStatuses;
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
  const leafSet = effectiveLeafCompletedSet(node, ctx);
  const matchCandidates = node.acceptedIds.filter((id) =>
    [...leafSet].some((done) => done.toLowerCase() === id.toLowerCase()),
  );
  const matched = matchCandidates.find((id) => !courseIdReserved(ctx.reservedForAll, id));
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
    .filter((id) => !courseIdReserved(ctx.reservedForAll, id))
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

  if (
    node.id === RESTRICTED_FLEX_NODE_ID &&
    ctx.suppressRestrictedFlexEvaluation
  ) {
    return {
      node,
      satisfiedBy: [],
      unitsSatisfied: 0,
      state: "open",
      candidates: [],
      label: "Restricted elective (resolving overlap rules…)",
    };
  }

  // Determine which completed courses match this tag.
  let matches = [...effectiveLeafCompletedSet(node, ctx)]
    .map((id) => ctx.courseById.get(id))
    .filter((c): c is Course => c !== undefined)
    .filter((c) => courseMatchesTag(c, node));

  if (ctx.reservedForAll?.size) {
    matches = matches.filter((c) => !courseIdReserved(ctx.reservedForAll, c.id));
  }

  if (ctx.restrictedElectiveExcludeIds?.size) {
    matches = matches.filter(
      (c) => !ctx.restrictedElectiveExcludeIds!.has(c.id),
    );
  }

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
    .filter((c) => !courseIdReserved(ctx.reservedForAll, c.id))
    .filter(
      (c) =>
        !ctx.restrictedElectiveExcludeIds?.size ||
        !ctx.restrictedElectiveExcludeIds.has(c.id),
    )
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

  if (
    node.id === RESTRICTED_FLEX_NODE_ID &&
    ctx.suppressRestrictedFlexEvaluation
  ) {
    return {
      node,
      satisfiedBy: [],
      unitsSatisfied: 0,
      state: "open",
      candidates: [],
      label: "Restricted elective (resolving overlap rules…)",
    };
  }

  let matches = [...effectiveLeafCompletedSet(node, ctx)]
    .map((id) => ctx.courseById.get(id))
    .filter((c): c is Course => c !== undefined)
    .filter((c) => courseMatchesDept(c, node));

  if (ctx.reservedForAll?.size) {
    matches = matches.filter((c) => !courseIdReserved(ctx.reservedForAll, c.id));
  }

  if (ctx.restrictedElectiveExcludeIds?.size) {
    matches = matches.filter(
      (c) => !ctx.restrictedElectiveExcludeIds!.has(c.id),
    );
  }

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
    .filter((c) => !courseIdReserved(ctx.reservedForAll, c.id))
    .filter(
      (c) =>
        !ctx.restrictedElectiveExcludeIds?.size ||
        !ctx.restrictedElectiveExcludeIds.has(c.id),
    )
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

function lookupCourseInCorpus(id: string, courseById: Map<string, Course>): Course | undefined {
  const direct = courseById.get(id);
  if (direct) return direct;
  const low = id.toLowerCase();
  for (const [k, c] of courseById) {
    if (k.toLowerCase() === low) return c;
  }
  return undefined;
}

function evalUnitsOutsideGir(node: UnitsOutsideGirNode, ctx: EvalContext): NodeStatus {
  const minU = node.minUnits;
  let sum = 0;
  const seenId = new Set<string>();

  for (const rawId of ctx.userCompletedIds) {
    const trimmed = rawId.trim();
    if (!trimmed) continue;
    const dedupeKey = trimmed.toLowerCase();
    if (seenId.has(dedupeKey)) continue;
    seenId.add(dedupeKey);

    const course = lookupCourseInCorpus(trimmed, ctx.courseById);
    if (!course) continue;
    if (course.girAttribute) continue;
    const u = course.totalUnits > 0 ? course.totalUnits : 12;
    sum += u;
  }

  let state: NodeStatus["state"];
  if (sum >= minU) state = "complete";
  else if (sum > 0) state = "partial";
  else state = "open";

  const label = `${sum}/${minU} units outside GIR (no GIR tag in catalog data)`;

  return {
    node,
    satisfiedBy: [],
    unitsSatisfied: sum,
    state,
    candidates: [],
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

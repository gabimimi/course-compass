/**
 * Requirement DSL for MIT majors.
 *
 * A requirement is a tree:
 *   - "all": every child must be satisfied
 *   - "any": at least N children must be satisfied (default 1)
 *   - "course": a specific course (or one of a set of accepted IDs)
 *   - "tag": any course matching a tag (e.g., HASS-A, CI-M, GIR LAB)
 *   - "department": any course in a department, optionally above some level
 *
 * Each leaf node carries its own "units" (or "count") expectation; aggregator
 * nodes ("all", "any") combine children's contributions and can also enforce a
 * minimum total unit count.
 */

import type {
  CommunicationRequirement,
  GirAttribute,
  HassAttribute,
} from "@/lib/data/types";

export type RequirementNode =
  | AllNode
  | AnyNode
  | CourseNode
  | TagNode
  | DepartmentNode;

export interface BaseNode {
  /** Stable id, used by UI for keying and progress tracking. */
  id: string;
  /** Human-readable title, e.g., "Foundation: Programming". */
  title: string;
  description?: string;
  /** Optional URL to the official source (e.g., department page). */
  sourceUrl?: string;
}

export interface AllNode extends BaseNode {
  kind: "all";
  children: RequirementNode[];
  /** Optional minimum total units across satisfied children. */
  minUnits?: number;
}

export interface AnyNode extends BaseNode {
  kind: "any";
  children: RequirementNode[];
  /** Number of children that must be satisfied (default 1). */
  needed?: number;
  /** Optional minimum total units across the satisfied children. */
  minUnits?: number;
}

export interface CourseNode extends BaseNode {
  kind: "course";
  /**
   * Accepted course IDs. The first one is the canonical/preferred id; any of
   * the listed ids will satisfy the requirement (used for cross-listings or
   * legacy numbers).
   */
  acceptedIds: string[];
}

export interface TagNode extends BaseNode {
  kind: "tag";
  /**
   * Match by attribute. Provide exactly one of these.
   */
  gir?: GirAttribute;
  /** "HASS-A" / "HASS-S" / "HASS-H" match a specific area; "HASS" matches any HASS area. */
  hass?: HassAttribute | "HASS";
  ci?: CommunicationRequirement;
  /** If specified, the satisfying course must be in this department. */
  departmentEquals?: string;
  /** Optional explicit allowlist of acceptable course IDs. */
  allowedIds?: string[];
  /** How many courses are needed (default 1). */
  count?: number;
  /** Optional minimum units. */
  minUnits?: number;
}

export interface DepartmentNode extends BaseNode {
  kind: "department";
  /** e.g., "6". */
  department: string;
  /** Minimum course number (after the dot). e.g., "6.1xxx" → 1000. */
  minNumber?: number;
  /** Maximum course number (inclusive). */
  maxNumber?: number;
  /** Optional explicit allowlist (overrides numeric range). */
  allowedIds?: string[];
  /** Optional explicit denylist (subtracted from allowlist/range). */
  excludedIds?: string[];
  /** How many courses are needed (default 1). */
  count?: number;
  /** Optional minimum total units. */
  minUnits?: number;
  /** Whether course must be at undergraduate level. */
  undergradOnly?: boolean;
}

export interface MajorRequirement {
  /** e.g., "6-3" */
  id: string;
  /** e.g., "Computer Science and Engineering (Course 6-3)" */
  name: string;
  /** Department for cosmetic grouping. */
  department: string;
  /** URL to the official department requirement page. */
  sourceUrl: string;
  /** Effective catalog year, e.g., "2025-2026". */
  catalogYear: string;
  /** Top-level "all" requirement node containing all sections. */
  root: AllNode;
  /** Author's note about what this MVP file does and doesn't capture. */
  notes?: string;
}

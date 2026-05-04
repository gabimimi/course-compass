"use client";

/**
 * Local user state, persisted to localStorage. Used everywhere we need to
 * know "which major is the student exploring" and "which classes have they
 * already completed".
 *
 * No auth in MVP — this is per-browser state only.
 */

import { useCallback, useEffect, useState } from "react";
import { MAJORS, CATALOG_YEARS, type CatalogYear } from "@/lib/requirements/data";

export type { CatalogYear };

/**
 * Map a graduation year to the catalog year a student should follow.
 * MIT students typically declare their major in their 2nd year, so they
 * follow the catalog from when they declare, which is roughly
 * (graduation year - 3) to (graduation year - 2).
 */
export function graduationYearToCatalogYear(graduationYear: number): CatalogYear {
  // Fall 2025+ entrants (≈ Class of 2029+) follow the Fall 2026 subject listings / 2026–2027 chart.
  if (graduationYear >= 2029) return "2026-2027";
  if (graduationYear >= 2027) return "2025-2026";
  if (graduationYear >= 2025) return "2024-2025";
  return "2023-2024";
}

const STORAGE_KEY = "course-compass:userState:v1";

export interface UserState {
  majorId: string | null;
  /** Catalog year for degree requirements, e.g. "2023-2024". */
  catalogYear: CatalogYear;
  /** Expected graduation year, e.g. 2027. Used to auto-suggest catalog year. */
  graduationYear: number | null;
  completedCourseIds: string[];
  /** Selected courses on the schedule planner (separate from completed). */
  scheduleCourseIds: string[];
  /**
   * Hydrant term slug (e.g. f26) for the planner iframe + API; null = use latest.json.
   */
  scheduleHydrantTermKey: string | null;
  /**
   * Requirement node IDs that the user has manually checked off.
   * This is used as an escape hatch for special subjects (6.S*, rotating
   * topics) that FireRoad doesn't attribute correctly.
   */
  overriddenRequirementIds: string[];
  /**
   * Maps requirement node IDs to course IDs the user manually assigned to
   * satisfy them. E.g. { "6-3.ci-m": ["6.S058"] }.
   * These courses are also automatically added to completedCourseIds.
   */
  manualAssignments: Record<string, string[]>;
}

const DEFAULT_STATE: UserState = {
  majorId: "6-3",
  catalogYear: "2026-2027",
  graduationYear: null,
  completedCourseIds: [],
  scheduleCourseIds: [],
  scheduleHydrantTermKey: null,
  overriddenRequirementIds: [],
  manualAssignments: {},
};

function load(): UserState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<UserState>;
    const storedMajor = parsed.majorId ?? DEFAULT_STATE.majorId;
    // If the stored major was removed (e.g., 6-1 / 6-2 from an earlier
    // version of the catalog data), fall back to the default. Otherwise the
    // /progress page would error out with "unknown major".
    const majorId =
      storedMajor && MAJORS[storedMajor]
        ? storedMajor
        : DEFAULT_STATE.majorId;
    const graduationYear = parsed.graduationYear ?? DEFAULT_STATE.graduationYear;
    // Use the stored catalog year; if not stored, derive from graduation year.
    const storedCatalogYear = parsed.catalogYear;
    const catalogYear: CatalogYear =
      storedCatalogYear && (CATALOG_YEARS as readonly string[]).includes(storedCatalogYear)
        ? (storedCatalogYear as CatalogYear)
        : graduationYear
          ? graduationYearToCatalogYear(graduationYear)
          : DEFAULT_STATE.catalogYear;

    // Merge manually-assigned courses into completedCourseIds so they're
    // always reflected in the completed set.
    const manualAssignments: Record<string, string[]> = parsed.manualAssignments ?? {};
    const allManualCourses = new Set(Object.values(manualAssignments).flat());
    const completedCourseIds = [
      ...new Set([...(parsed.completedCourseIds ?? []), ...allManualCourses]),
    ];

    return {
      majorId,
      catalogYear,
      graduationYear,
      completedCourseIds,
      scheduleCourseIds: parsed.scheduleCourseIds ?? [],
      scheduleHydrantTermKey:
        typeof parsed.scheduleHydrantTermKey === "string" && parsed.scheduleHydrantTermKey.trim()
          ? parsed.scheduleHydrantTermKey.trim()
          : null,
      overriddenRequirementIds: parsed.overriddenRequirementIds ?? [],
      manualAssignments,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function save(state: UserState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

/**
 * Latest persisted preferences (major, catalog year, completed courses).
 * Use when firing async work (e.g. chat) that must not rely on a stale hook
 * snapshot after the user changed settings on another view.
 */
export function readPersistedUserState(): UserState {
  return load();
}

/** Dispatched on `window` after chat (or other tools) rewrite `scheduleCourseIds`. */
export const SCHEDULE_COURSES_SYNC_EVENT = "course-compass:scheduleCoursesSync";

/** Replace planner subjects and optional Hydrant term; notify subscribers. */
export function replaceScheduleCourseIdsFromChat(
  courseIds: string[],
  options?: { hydrantTermKey?: string },
): void {
  if (typeof window === "undefined") return;
  const prev = load();
  const next: UserState = {
    ...prev,
    scheduleCourseIds: [...new Set(courseIds.map((s) => s.trim()))],
    ...(options && typeof options.hydrantTermKey === "string"
      ? { scheduleHydrantTermKey: options.hydrantTermKey }
      : {}),
  };
  save(next);
  window.dispatchEvent(new Event(SCHEDULE_COURSES_SYNC_EVENT));
}

/**
 * Hook for reading + updating user state. The first render returns the
 * default to avoid hydration mismatch; the actual stored value loads on the
 * client effect.
 */
export function useUserState() {
  const [state, setState] = useState<UserState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScheduleSync = () => {
      setState(load());
    };
    window.addEventListener(SCHEDULE_COURSES_SYNC_EVENT, onScheduleSync);
    return () => window.removeEventListener(SCHEDULE_COURSES_SYNC_EVENT, onScheduleSync);
  }, []);

  const update = useCallback(
    (patch: Partial<UserState> | ((prev: UserState) => Partial<UserState>)) => {
      setState((prev) => {
        const p = typeof patch === "function" ? patch(prev) : patch;
        const next = { ...prev, ...p };
        save(next);
        return next;
      });
    },
    [],
  );

  const toggleCompleted = useCallback((courseId: string) => {
    setState((prev) => {
      const set = new Set(prev.completedCourseIds);
      if (set.has(courseId)) set.delete(courseId);
      else set.add(courseId);
      const next = { ...prev, completedCourseIds: [...set] };
      save(next);
      return next;
    });
  }, []);

  const toggleSchedule = useCallback((courseId: string) => {
    setState((prev) => {
      const set = new Set(prev.scheduleCourseIds);
      if (set.has(courseId)) set.delete(courseId);
      else set.add(courseId);
      const next = { ...prev, scheduleCourseIds: [...set] };
      save(next);
      return next;
    });
  }, []);

  const toggleOverride = useCallback((requirementId: string) => {
    setState((prev) => {
      const set = new Set(prev.overriddenRequirementIds);
      if (set.has(requirementId)) set.delete(requirementId);
      else set.add(requirementId);
      const next = { ...prev, overriddenRequirementIds: [...set] };
      save(next);
      return next;
    });
  }, []);

  /**
   * Assign a course to a specific requirement slot.
   * The course is also added to completedCourseIds automatically.
   */
  const addManualAssignment = useCallback((nodeId: string, courseId: string) => {
    const id = courseId.trim().toUpperCase();
    if (!id) return;
    setState((prev) => {
      const existing = prev.manualAssignments[nodeId] ?? [];
      if (existing.includes(id)) return prev;
      const manualAssignments = { ...prev.manualAssignments, [nodeId]: [...existing, id] };
      // Ensure the course is also in completedCourseIds
      const completedSet = new Set(prev.completedCourseIds);
      completedSet.add(id);
      const next: UserState = {
        ...prev,
        manualAssignments,
        completedCourseIds: [...completedSet],
      };
      save(next);
      return next;
    });
  }, []);

  /**
   * Remove a manually-assigned course from a requirement slot.
   * The course stays in completedCourseIds unless removed separately.
   */
  const removeManualAssignment = useCallback((nodeId: string, courseId: string) => {
    setState((prev) => {
      const existing = prev.manualAssignments[nodeId] ?? [];
      const updated = existing.filter((id) => id !== courseId);
      const manualAssignments = { ...prev.manualAssignments };
      if (updated.length === 0) {
        delete manualAssignments[nodeId];
      } else {
        manualAssignments[nodeId] = updated;
      }
      const next: UserState = { ...prev, manualAssignments };
      save(next);
      return next;
    });
  }, []);

  return {
    state,
    hydrated,
    update,
    toggleCompleted,
    toggleSchedule,
    toggleOverride,
    addManualAssignment,
    removeManualAssignment,
  };
}

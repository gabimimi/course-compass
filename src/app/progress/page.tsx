"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { MajorPicker } from "@/components/chat/MajorPicker";
import { CourseSearch } from "@/components/progress/CourseSearch";
import { RequirementTree } from "@/components/progress/RequirementTree";
import { useUserState, graduationYearToCatalogYear } from "@/lib/userState";
import { CATALOG_YEARS, MAJORS_BY_YEAR, type CatalogYear } from "@/lib/requirements/data";
import type { Course } from "@/lib/data/types";
import type { NodeStatus, ProgressReport } from "@/lib/requirements/engine";

/**
 * Count requirement "slots" — not raw leaf nodes.
 *
 * - Leaf (course / tag / dept): 1 slot, done=1 if complete.
 * - "any" node: `needed` slots total (you only have to pick `needed` options,
 *   not all children). done = min(complete_children, needed).
 * - "all" node: recurse — sum of children's slot counts.
 *
 * This prevents the inflated counts that occur when an "any" node has many
 * options (e.g. Physics I with 4 variants counts as 4 not 1, or perTrackAny
 * with 16 track options counts as 16 not 1).
 */
function reqCounts(node: NodeStatus): { c: number; t: number } {
  const kind = node.node.kind;
  const children = node.children ?? [];

  // Leaf types — or any leaf-like node with no children
  if (children.length === 0 || kind === "course" || kind === "tag" || kind === "department") {
    return { c: node.state === "complete" ? 1 : 0, t: 1 };
  }

  if (kind === "any") {
    // This represents "pick needed of the listed options" — N slots, not M options.
    const needed = (node.node as import("@/lib/requirements/types").AnyNode).needed ?? 1;
    const done = Math.min(children.filter((ch) => ch.state === "complete").length, needed);
    return { c: done, t: needed };
  }

  // "all" node: sum of children's slot counts
  return children.reduce(
    (acc, ch) => {
      const r = reqCounts(ch);
      return { c: acc.c + r.c, t: acc.t + r.t };
    },
    { c: 0, t: 0 },
  );
}

export default function ProgressPage() {
  const {
    state,
    hydrated,
    update,
    toggleCompleted,
    toggleOverride,
    addManualAssignment,
    removeManualAssignment,
  } = useUserState();
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coursesById, setCoursesById] = useState<Record<string, Course>>({});

  const completedSet = useMemo(
    () => new Set(state.completedCourseIds),
    [state.completedCourseIds],
  );

  const overriddenSet = useMemo(
    () => new Set(state.overriddenRequirementIds ?? []),
    [state.overriddenRequirementIds],
  );

  const manualAssignments = useMemo(
    () => state.manualAssignments ?? {},
    [state.manualAssignments],
  );

  useEffect(() => {
    if (!hydrated || !state.majorId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        majorId: state.majorId,
        catalogYear: state.catalogYear,
        completedCourseIds: state.completedCourseIds,
        overriddenRequirementIds: state.overriddenRequirementIds ?? [],
        manualAssignments: state.manualAssignments ?? {},
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = (await res.json()) as ProgressReport;
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    hydrated,
    state.majorId,
    state.catalogYear,
    state.completedCourseIds,
    state.overriddenRequirementIds,
    state.manualAssignments,
  ]);

  // Cache course details for completed chips
  useEffect(() => {
    const missing = state.completedCourseIds.filter((id) => !coursesById[id]);
    if (missing.length === 0) return;
    Promise.all(
      missing.map(async (id) => {
        const res = await fetch(`/api/courses?q=${encodeURIComponent(id)}&limit=1`);
        const data = (await res.json()) as { courses: Course[] };
        const c = data.courses.find((c) => c.id === id) ?? data.courses[0];
        return c;
      }),
    ).then((results) => {
      setCoursesById((prev) => {
        const next = { ...prev };
        for (let i = 0; i < missing.length; i++) {
          const c = results[i];
          if (c) next[missing[i]] = c;
        }
        return next;
      });
    });
  }, [state.completedCourseIds, coursesById]);

  const { completionPct, completedLeaves, totalLeaves } = useMemo(() => {
    if (!report) return { completionPct: 0, completedLeaves: 0, totalLeaves: 0 };
    const { c, t } = reqCounts(report.root);
    return {
      completionPct: t === 0 ? 0 : (c / t) * 100,
      completedLeaves: c,
      totalLeaves: t,
    };
  }, [report]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-5xl w-full space-y-6 py-5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-6">

      {/* ── Top control bar ── */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs uppercase tracking-wide text-[var(--muted)] mb-1">
            Major
          </label>
          <MajorPicker
            value={hydrated ? state.majorId : "6-3"}
            onChange={(id) => update({ majorId: id })}
            className="w-full"
          />
        </div>

        <div className="min-w-[140px]">
          <label className="block text-xs uppercase tracking-wide text-[var(--muted)] mb-1">
            Graduation year
          </label>
          <select
            className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            value={hydrated ? (state.graduationYear ?? "") : ""}
            onChange={(e) => {
              const yr = e.target.value ? parseInt(e.target.value, 10) : null;
              const catalogYear = yr ? graduationYearToCatalogYear(yr) : state.catalogYear;
              update({ graduationYear: yr, catalogYear });
            }}
          >
            <option value="">— unknown —</option>
            {[2026, 2027, 2028, 2029, 2030].map((y) => (
              <option key={y} value={y}>
                Class of {y}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[160px]">
          <label className="block text-xs uppercase tracking-wide text-[var(--muted)] mb-1">
            Catalog year
          </label>
          <select
            className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            value={hydrated ? state.catalogYear : "2026-2027"}
            onChange={(e) => update({ catalogYear: e.target.value as CatalogYear })}
          >
            {CATALOG_YEARS.map((y) => {
              const available =
                state.majorId && MAJORS_BY_YEAR[state.majorId ?? ""]?.[y] != null;
              return (
                <option key={y} value={y} disabled={!available}>
                  {y}{!available ? " (n/a)" : ""}
                </option>
              );
            })}
          </select>
        </div>

        <div className="flex-[2] min-w-[220px]">
          <label className="block text-xs uppercase tracking-wide text-[var(--muted)] mb-1">
            Add a completed course
          </label>
          <CourseSearch
            selectedIds={completedSet}
            onPick={(c) => {
              if (!completedSet.has(c.id)) toggleCompleted(c.id);
              setCoursesById((prev) => ({ ...prev, [c.id]: c }));
            }}
          />
        </div>
      </div>

      {hydrated &&
        state.majorId === "6-5" &&
        !MAJORS_BY_YEAR["6-5"]?.[state.catalogYear] && (
        <div
          className="rounded-md border border-[var(--progress-note-border)] bg-[var(--progress-note-bg)] px-3 py-2 text-xs text-[var(--progress-note-text)]"
        >
          <strong className="text-[var(--eecs-purple)]">Note:</strong> Course 6-5 (Electrical Engineering with Computing) was introduced in the 2025-2026 catalog.
          If you are on an earlier catalog year, check with your advisor about applicable requirements.
        </div>
      )}

      {/* ── Completed chips ── */}
      {state.completedCourseIds.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Completed courses ({state.completedCourseIds.length})
            </span>
            <button
              onClick={() => update({ completedCourseIds: [] })}
              className="text-xs text-[var(--muted)] hover:text-foreground"
            >
              Clear all
            </button>
          </div>
          <ul className="flex flex-wrap gap-2">
            {state.completedCourseIds.map((id) => {
              const c = coursesById[id];
              return (
                <li
                  key={id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--eecs-cyan)_40%,var(--border))] bg-[color-mix(in_srgb,var(--eecs-cyan)_10%,var(--card))] pl-2.5 pr-1.5 py-0.5 text-xs"
                >
                  <span className="font-mono font-semibold text-[var(--progress-stat-on-track)]">
                    {id}
                  </span>
                  {c?.title && (
                    <span className="text-[var(--progress-stat-on-track)] max-w-[140px] truncate opacity-90">
                      {c.title}
                    </span>
                  )}
                  <button
                    onClick={() => toggleCompleted(id)}
                    className="text-[var(--eecs-magenta)] hover:opacity-80"
                    aria-label={`Remove ${id}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Progress summary bar ── */}
      {report && !loading && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h1 className="text-lg font-bold tracking-tight">{report.major.name}</h1>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Catalog year {report.major.catalogYear}
                {" · "}
                <a
                  href={report.major.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--primary)] hover:underline"
                >
                  Official degree chart ↗
                </a>
                {" · "}
                Data is local-only — never leaves your browser.
              </p>
            </div>

            <div className="text-right shrink-0">
              <div className="text-2xl font-bold tabular-nums">
                {Math.round(completionPct)}
                <span className="text-sm font-normal text-[var(--muted)]">%</span>
              </div>
              <div className="text-xs text-[var(--muted)]">
                {completedLeaves}/{totalLeaves} requirements
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2.5 rounded-full bg-[var(--accent)] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--eecs-purple)] via-[var(--eecs-magenta)] to-[var(--eecs-cyan)] transition-all duration-500"
              style={{ width: `${completionPct}%` }}
            />
          </div>

          {/* Stats row */}
          <div className="mt-2.5 flex flex-wrap gap-4 text-xs text-[var(--muted)]">
            <StatChip
              label="Units logged"
              value={`${report.totalUnitsCompleted}`}
              tone="onTrack"
            />
            <StatChip
              label="Requirements done"
              value={`${completedLeaves}`}
              tone="onTrack"
            />
            <StatChip
              label="Requirements remaining"
              value={`${totalLeaves - completedLeaves}`}
              tone={totalLeaves - completedLeaves > 0 ? "remaining" : "onTrack"}
            />
          </div>

          {report.major.notes && (
            <div
              className="mt-3 rounded-md border border-[var(--progress-note-border)] bg-[var(--progress-note-bg)] px-3 py-2 text-xs text-[var(--progress-note-text)]"
            >
              <strong className="text-[var(--eecs-purple)]">Note:</strong>{" "}
              {report.major.notes}
            </div>
          )}
        </div>
      )}

      {/* ── Main checklist ── */}
      {!hydrated || loading ? (
        <div className="flex items-center gap-2 text-[var(--muted)] py-8 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Computing degree progress…</span>
        </div>
      ) : error ? (
        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          Error loading progress: {error}
        </div>
      ) : report ? (
        <RequirementTree
          status={report.root}
          overriddenSet={overriddenSet}
          onToggleOverride={toggleOverride}
          manualAssignments={manualAssignments}
          onAddManualAssignment={addManualAssignment}
          onRemoveManualAssignment={removeManualAssignment}
        />
      ) : (
        <p className="text-center text-[var(--muted)] py-12">
          Pick a major above to see your degree checklist.
        </p>
      )}
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "onTrack" | "remaining";
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn(
          "font-semibold",
          tone === "onTrack"
            ? "text-[var(--progress-stat-on-track)]"
            : "text-[var(--progress-stat-remaining)]",
        )}
      >
        {value}
      </span>{" "}
      {label}
    </span>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

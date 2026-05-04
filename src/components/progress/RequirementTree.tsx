"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, ExternalLink, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Course } from "@/lib/data/types";
import type { NodeStatus } from "@/lib/requirements/engine";

// ---------------------------------------------------------------------------
// Context for all row-level callbacks (avoids prop-drilling)
// ---------------------------------------------------------------------------

import { createContext, useContext } from "react";

interface RowCtx {
  overriddenSet: Set<string>;
  onToggleOverride: (id: string) => void;
  manualAssignments: Record<string, string[]>;
  onAddManualAssignment: (nodeId: string, courseId: string) => void;
  onRemoveManualAssignment: (nodeId: string, courseId: string) => void;
}
const RowContext = createContext<RowCtx>({
  overriddenSet: new Set(),
  onToggleOverride: () => {},
  manualAssignments: {},
  onAddManualAssignment: () => {},
  onRemoveManualAssignment: () => {},
});
function useRowCtx() {
  return useContext(RowContext);
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

export function RequirementTree({
  status,
  overriddenSet = new Set(),
  onToggleOverride = () => {},
  manualAssignments = {},
  onAddManualAssignment = () => {},
  onRemoveManualAssignment = () => {},
}: {
  status: NodeStatus;
  overriddenSet?: Set<string>;
  onToggleOverride?: (id: string) => void;
  manualAssignments?: Record<string, string[]>;
  onAddManualAssignment?: (nodeId: string, courseId: string) => void;
  onRemoveManualAssignment?: (nodeId: string, courseId: string) => void;
}) {
  const sections = status.children ?? [];
  return (
    <RowContext.Provider
      value={{
        overriddenSet,
        onToggleOverride,
        manualAssignments,
        onAddManualAssignment,
        onRemoveManualAssignment,
      }}
    >
      <div className="space-y-4">
        {sections.map((s) => (
          <Section key={s.node.id} status={s} depth={0} />
        ))}
      </div>
    </RowContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Section — a collapsible block with a header bar
// ---------------------------------------------------------------------------

function Section({ status, depth }: { status: NodeStatus; depth: number }) {
  const [open, setOpen] = useState(true);
  const isLeaf = !status.children || status.children.length === 0;

  // Count complete / total children for the badge
  const { done, total } = leafCounts(status);

  const borderColor =
    status.state === "complete"
      ? "border-[var(--progress-complete-border)]"
      : status.state === "partial"
        ? "border-[var(--progress-partial-border)]"
        : "border-[var(--border)]";

  const headerBg =
    depth === 0
      ? "bg-[var(--accent)]/60 dark:bg-[var(--accent)]/40"
      : "bg-[var(--accent)]/30";

  if (isLeaf) {
    return <LeafRow status={status} />;
  }

  return (
    <div className={cn("rounded-lg border overflow-hidden", borderColor)}>
      {/* Section header */}
      <button
        className={cn(
          "flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left",
          headerBg,
          "hover:brightness-95 transition-all",
        )}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <StatusDot state={status.state} />

        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-[var(--muted)] shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-[var(--muted)] shrink-0" />
        )}

        <span
          className={cn(
            "min-w-0 flex-1 break-words font-semibold text-sm",
            depth === 0 && "text-base",
          )}
        >
          {status.node.title}
        </span>

        {status.node.sourceUrl && (
          <a
            href={status.node.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[var(--muted)] hover:text-foreground"
            title="Official source"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}

        <ProgressBadge state={status.state} done={done} total={total} label={status.label} />
      </button>

      {/* Rows */}
      {open && (
        <div className="divide-y divide-[var(--border)]">
          {status.children!.map((child) => (
            <RowOrSection key={child.node.id} status={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RowOrSection — decide whether a child is rendered as a nested section
//               or as a flat row
// ---------------------------------------------------------------------------

function RowOrSection({ status, depth }: { status: NodeStatus; depth: number }) {
  const isLeaf = !status.children || status.children.length === 0;

  // Leaf → row
  if (isLeaf) {
    return <LeafRow status={status} />;
  }

  // A node whose children are ALL leaves → inline option table
  const allChildrenLeaf = status.children!.every(
    (c) => !c.children || c.children.length === 0,
  );

  if (allChildrenLeaf && status.node.kind === "any") {
    return <AnyRow status={status} />;
  }

  // Otherwise render as a nested section
  return (
    <div className="px-3 py-2">
      <Section status={status} depth={depth} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// LeafRow — a single course requirement
// ---------------------------------------------------------------------------

function LeafRow({ status }: { status: NodeStatus }) {
  const { overriddenSet, onToggleOverride, manualAssignments, onAddManualAssignment, onRemoveManualAssignment } =
    useRowCtx();
  const isOverridden = overriddenSet.has(status.node.id);
  const complete = status.state === "complete";
  const candidates = status.candidates;
  const [showCandidates, setShowCandidates] = useState(false);
  const [addingCourse, setAddingCourse] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const assignedCourses = manualAssignments[status.node.id] ?? [];

  function submitAssignment() {
    const id = inputValue.trim().toUpperCase();
    if (id) {
      onAddManualAssignment(status.node.id, id);
    }
    setInputValue("");
    setAddingCourse(false);
  }

  return (
    <div className={cn("px-3 py-2", complete && "bg-[var(--progress-complete-row-bg)]")}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onToggleOverride(status.node.id)}
          title={
            isOverridden
              ? "Manually marked complete — click to unmark"
              : complete
                ? "Satisfied by completed course"
                : "Manually mark this requirement as complete"
          }
          className="shrink-0"
        >
          <StatusIcon state={complete ? "complete" : isOverridden ? "complete" : status.state} />
        </button>

        <span
          className={cn(
            "min-w-0 flex-1 text-sm break-words",
            complete && "line-through text-[var(--muted)] decoration-[color-mix(in_srgb,var(--eecs-cyan)_55%,transparent)] decoration-1",
          )}
        >
          <span className="font-medium">{status.node.title}</span>
        </span>

        {/* Satisfied-by chips */}
        {status.satisfiedBy.length > 0 && (
          <span className="text-xs text-[var(--progress-stat-on-track)] font-mono shrink-0">
            {status.satisfiedBy.join(", ")}
          </span>
        )}

        {isOverridden && !complete && (
          <span className="text-xs text-[var(--progress-stat-on-track)] shrink-0 italic">
            manual
          </span>
        )}

        {!complete && !isOverridden && candidates.length > 0 && (
          <button
            onClick={() => setShowCandidates((s) => !s)}
            className="text-xs text-[var(--primary)] hover:underline shrink-0"
          >
            {showCandidates ? "hide" : `${candidates.length} options`}
          </button>
        )}

        {/* Add course button */}
        {!addingCourse && (
          <button
            onClick={() => {
              setAddingCourse(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            title="Manually assign a course to this requirement (useful for special subjects like 6.S*, 6.C*)"
            className={cn(
              "shrink-0 rounded p-0.5 transition-colors",
              "text-[var(--muted)] hover:text-[var(--primary)] hover:bg-[var(--accent)]",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}

        {status.node.sourceUrl && (
          <a
            href={status.node.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--muted)] hover:text-foreground shrink-0"
            title="Official source"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Manually-assigned course chips */}
      {assignedCourses.length > 0 && (
        <div className="mt-1 ml-6 flex flex-wrap gap-1">
          {assignedCourses.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 text-xs px-2 py-0.5 font-mono"
            >
              {id}
              <button
                onClick={() => onRemoveManualAssignment(status.node.id, id)}
                title={`Remove ${id} from this requirement`}
                className="hover:text-red-600 dark:hover:text-red-400"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Inline course-add input */}
      {addingCourse && (
        <div className="mt-1.5 ml-6 flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitAssignment();
              if (e.key === "Escape") {
                setAddingCourse(false);
                setInputValue("");
              }
            }}
            placeholder="e.g. 6.S058"
            className={cn(
              "w-28 rounded border border-[var(--border)] bg-[var(--card)]",
              "px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)]",
            )}
          />
          <button
            onClick={submitAssignment}
            className="rounded bg-[var(--primary)] px-2 py-1 text-xs text-white hover:opacity-90"
          >
            Assign
          </button>
          <button
            onClick={() => {
              setAddingCourse(false);
              setInputValue("");
            }}
            className="text-xs text-[var(--muted)] hover:text-foreground"
          >
            Cancel
          </button>
          <span className="text-[10px] text-[var(--muted)]">
            Course must also be in your Completed list
          </span>
        </div>
      )}

      {showCandidates && candidates.length > 0 && (
        <CandidatesPanel courses={candidates} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnyRow — "choose N from" inline option list (used for any-nodes whose
//          children are all leaves, e.g., "pick one of 6.1200 or 18.06")
// ---------------------------------------------------------------------------

function AnyRow({ status }: { status: NodeStatus }) {
  const complete = status.state === "complete";
  const partial = status.state === "partial";
  const needed = (status.node as import("@/lib/requirements/types").AnyNode).needed ?? 1;
  const satisfied = status.children!.filter((c) => c.state === "complete");
  const [expanded, setExpanded] = useState(!complete);

  return (
    <div className={cn("px-3 py-2", complete && "bg-[var(--progress-complete-row-bg)]")}>
      {/* Header row */}
      <div className="flex items-center gap-2">
        <StatusIcon state={status.state} />

        <button
          className="group flex min-w-0 flex-1 items-center gap-1 text-left"
          onClick={() => setExpanded((e) => !e)}
        >
          <span
            className={cn(
              "min-w-0 flex-1 break-words text-sm font-medium",
              complete && "line-through text-[var(--muted)] decoration-[color-mix(in_srgb,var(--eecs-cyan)_55%,transparent)] decoration-1",
            )}
          >
            {status.node.title}
          </span>

          {expanded ? (
            <ChevronDown className="h-3 w-3 text-[var(--muted)]" />
          ) : (
            <ChevronRight className="h-3 w-3 text-[var(--muted)]" />
          )}
        </button>

        <span
          className={cn(
            "text-xs shrink-0",
            complete
              ? "text-[var(--progress-stat-on-track)]"
              : partial
                ? "text-[var(--progress-stat-remaining)]"
                : "text-[var(--muted)]",
          )}
        >
          {satisfied.length}/{needed}
        </span>
      </div>

      {/* Option rows */}
      {expanded && (
        <div className="mt-1.5 ml-2 max-sm:overflow-x-auto rounded-md border border-[var(--border)] overflow-hidden sm:ml-6">
          {status.children!.map((child, i) => (
            <AnyChildRow key={child.node.id} status={child} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnyChildRow — compact row inside an AnyRow's expanded option table
// ---------------------------------------------------------------------------

function AnyChildRow({ status, index }: { status: NodeStatus; index: number }) {
  const { manualAssignments, onAddManualAssignment, onRemoveManualAssignment } = useRowCtx();
  const done = status.state === "complete";
  const assignedCourses = manualAssignments[status.node.id] ?? [];
  const [addingCourse, setAddingCourse] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submitAssignment() {
    const id = inputValue.trim().toUpperCase();
    if (id) onAddManualAssignment(status.node.id, id);
    setInputValue("");
    setAddingCourse(false);
  }

  return (
    <div
      className={cn(
        "text-xs",
        index > 0 && "border-t border-[var(--border)]",
        done && "bg-[var(--progress-complete-row-bg)]",
      )}
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <StatusIcon state={done ? "complete" : status.state} size="sm" />
        <span
          className={cn(
            "flex-1",
            done && "line-through text-[var(--muted)] decoration-[color-mix(in_srgb,var(--eecs-cyan)_55%,transparent)] decoration-1",
          )}
        >
          {status.node.title}
        </span>
        {status.satisfiedBy.length > 0 && (
          <span className="font-mono text-[var(--progress-stat-on-track)]">
            {status.satisfiedBy.join(", ")}
          </span>
        )}
        {/* Manually-assigned chips */}
        {assignedCourses.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 px-1.5 py-px font-mono"
          >
            {id}
            <button
              onClick={() => onRemoveManualAssignment(status.node.id, id)}
              title={`Remove ${id}`}
              className="hover:text-red-600 dark:hover:text-red-400"
            >
              <X className="h-2 w-2" />
            </button>
          </span>
        ))}
        {/* + button */}
        {!addingCourse && (
          <button
            onClick={() => {
              setAddingCourse(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            title="Manually assign a course to this slot"
            className="text-[var(--muted)] hover:text-[var(--primary)] rounded p-px hover:bg-[var(--accent)]"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
        {!done && status.candidates[0]?.catalogUrl && (
          <a
            href={status.candidates[0].catalogUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--muted)] hover:text-[var(--primary)]"
            title="Catalog"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Inline input */}
      {addingCourse && (
        <div className="px-2.5 pb-1.5 flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitAssignment();
              if (e.key === "Escape") { setAddingCourse(false); setInputValue(""); }
            }}
            placeholder="e.g. 6.S058"
            className="w-24 rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
          <button onClick={submitAssignment} className="rounded bg-[var(--primary)] px-1.5 py-0.5 text-xs text-white hover:opacity-90">
            Assign
          </button>
          <button onClick={() => { setAddingCourse(false); setInputValue(""); }} className="text-[var(--muted)] hover:text-foreground text-xs">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CandidatesPanel
// ---------------------------------------------------------------------------

function CandidatesPanel({ courses }: { courses: Course[] }) {
  return (
    <div className="mt-1.5 ml-0 max-sm:-mx-1 sm:ml-6 overflow-x-auto rounded-md border border-dashed border-[var(--border)] bg-[var(--accent)]/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1.5 font-medium">
        Courses that satisfy this requirement
      </div>
      <table className="w-full text-xs border-collapse">
        <tbody>
          {courses.map((c) => (
            <tr key={c.id} className="align-top">
              <td className="py-0.5 pr-3 font-mono text-[var(--primary)] whitespace-nowrap">
                <a
                  href={c.catalogUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  title={c.description.slice(0, 160)}
                >
                  {c.id}
                </a>
              </td>
              <td className="py-0.5 pr-2 text-[var(--muted)] w-full line-clamp-1">
                {c.title}
              </td>
              <td className="py-0.5 text-[var(--muted)] whitespace-nowrap text-right">
                {c.totalUnits}u
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status visuals
// ---------------------------------------------------------------------------

function StatusIcon({
  state,
  size = "md",
}: {
  state: NodeStatus["state"];
  size?: "sm" | "md";
}) {
  const s = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  if (state === "complete") {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-[var(--progress-check-fill)] text-white shrink-0",
          size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4",
        )}
      >
        <Check className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      </span>
    );
  }
  if (state === "partial") {
    return <Minus className={cn(s, "text-[var(--progress-partial-icon)] shrink-0")} />;
  }
  return (
    <span
      className={cn(
        "rounded-full border-2 border-[var(--muted)]/40 shrink-0",
        size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4",
      )}
    />
  );
}

function StatusDot({ state }: { state: NodeStatus["state"] }) {
  if (state === "complete")
    return <span className="h-2 w-2 rounded-full bg-[var(--progress-check-fill)] shrink-0" />;
  if (state === "partial")
    return <span className="h-2 w-2 rounded-full bg-[var(--eecs-magenta)] shrink-0" />;
  return <span className="h-2 w-2 rounded-full bg-[var(--muted)]/30 shrink-0" />;
}

function ProgressBadge({
  state,
  done,
  total,
  label,
}: {
  state: NodeStatus["state"];
  done: number;
  total: number;
  label: string;
}) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <span
      className={cn(
        "ml-2 text-xs rounded-full px-2 py-0.5 shrink-0 tabular-nums",
        state === "complete"
          ? "bg-[color-mix(in_srgb,var(--eecs-cyan)_22%,var(--card))] text-[var(--progress-stat-on-track)]"
          : state === "partial"
            ? "bg-[color-mix(in_srgb,var(--eecs-magenta)_18%,var(--card))] text-[var(--progress-stat-remaining)]"
            : "bg-[var(--accent)] text-[var(--muted)]",
      )}
    >
      {state === "complete" ? (
        "Complete"
      ) : total > 1 ? (
        `${done}/${total} · ${pct}%`
      ) : (
        label
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function leafCounts(node: NodeStatus): { done: number; total: number } {
  const kind = node.node.kind;
  const children = node.children ?? [];

  if (children.length === 0 || kind === "course" || kind === "tag" || kind === "department") {
    return { done: node.state === "complete" ? 1 : 0, total: 1 };
  }

  if (kind === "any") {
    const needed = (node.node as import("@/lib/requirements/types").AnyNode).needed ?? 1;
    const done = Math.min(children.filter((c) => c.state === "complete").length, needed);
    return { done, total: needed };
  }

  return children.reduce(
    (acc, c) => {
      const r = leafCounts(c);
      return { done: acc.done + r.done, total: acc.total + r.total };
    },
    { done: 0, total: 0 },
  );
}

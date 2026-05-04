"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import type { Course } from "@/lib/data/types";

export function CourseSearch({
  onPick,
  selectedIds,
  placeholder = "Search by course id or title (e.g., 6.1010 or algorithms)",
}: {
  onPick: (course: Course) => void;
  selectedIds: Set<string>;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/courses?q=${encodeURIComponent(trimmed)}&limit=12`);
        const data = (await res.json()) as { courses: Course[] };
        if (!cancelled) setResults(data.courses);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const visible = useMemo(() => results, [results]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[var(--muted)]" />
        )}
      </div>

      {q.trim().length >= 2 && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          {visible.length === 0 && !loading && (
            <div className="px-3 py-2 text-sm text-[var(--muted)]">No matches.</div>
          )}
          <ul className="max-h-72 overflow-y-auto divide-y divide-[var(--border)]">
            {visible.map((c) => {
              const selected = selectedIds.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onPick(c)}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--accent)] flex items-start gap-3"
                  >
                    <span className="font-mono text-sm text-[var(--primary)] mt-0.5">
                      {c.id}
                    </span>
                    <span className="flex-1 text-sm">
                      <span className="font-medium">{c.title}</span>
                      <span className="block text-xs text-[var(--muted)] line-clamp-1">
                        {c.totalUnits}u · {c.department}
                        {c.hassAttribute && ` · ${c.hassAttribute}`}
                        {c.communicationRequirement && ` · ${c.communicationRequirement}`}
                        {c.girAttribute && ` · GIR ${c.girAttribute}`}
                      </span>
                    </span>
                    {selected ? (
                      <span className="text-xs text-[var(--progress-stat-on-track)] mt-0.5">Added</span>
                    ) : (
                      <span className="text-xs text-[var(--muted)] mt-0.5">+ Add</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

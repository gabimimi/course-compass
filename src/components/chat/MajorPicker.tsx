"use client";

import { MAJOR_LIST } from "@/lib/requirements/data";
import { cn } from "@/lib/utils/cn";

export function MajorPicker({
  value,
  onChange,
  className,
  /** `short`: option text is e.g. `6-3` only (fits phones). `full`: id — full name (degree page). */
  optionStyle = "full",
}: {
  value: string | null;
  onChange: (id: string) => void;
  className?: string;
  optionStyle?: "short" | "full";
}) {
  const current = MAJOR_LIST.find((m) => m.id === value) ?? MAJOR_LIST[0];
  const ariaMajor = current
    ? `${current.id}, ${current.name.replace(/ \(Course .*\)$/, "")}`
    : "Major";

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`Major, ${ariaMajor}`}
      title={ariaMajor}
      className={cn(
        "max-w-full rounded-md border border-[var(--border)] bg-[var(--card)] shadow-xs focus:outline-none focus:ring-2 focus:ring-[var(--ring)]",
        optionStyle === "short"
          ? "min-h-9 py-1.5 pl-2 pr-7 text-xs tabular-nums sm:py-1.5 sm:pl-2.5 sm:pr-8 sm:text-sm"
          : "px-3 py-1.5 text-sm",
        className,
      )}
    >
      {MAJOR_LIST.map((m) => {
        const shortName = m.name.replace(/ \(Course .*\)$/, "");
        return (
          <option key={m.id} value={m.id}>
            {optionStyle === "short" ? m.id : `${m.id} — ${shortName}`}
          </option>
        );
      })}
    </select>
  );
}

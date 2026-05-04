import type { Course, MeetingTime } from "@/lib/data/types";
import { resolveCourseFromMention } from "@/lib/requirements/courseCoverage";

export function meetingsOverlap(a: MeetingTime, b: MeetingTime): boolean {
  if (a.day !== b.day) return false;
  return a.startHour < b.endHour && b.startHour < a.endHour;
}

function formatHourLabel(h: number): string {
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  const ampm = hours >= 12 ? "p" : "a";
  const display = hours % 12 === 0 ? 12 : hours % 12;
  if (minutes === 0) return `${display}${ampm}`;
  return `${display}:${String(minutes).padStart(2, "0")}${ampm}`;
}

function formatMeetingLine(m: MeetingTime): string {
  const dayNames: Record<MeetingTime["day"], string> = {
    M: "Mon",
    T: "Tue",
    W: "Wed",
    R: "Thu",
    F: "Fri",
    S: "Sat",
    U: "Sun",
  };
  const d = dayNames[m.day] ?? m.day;
  const kind = m.kind ? ` · ${m.kind}` : "";
  const loc = m.location ? ` · ${m.location}` : "";
  return `${d} ${formatHourLabel(m.startHour)}–${formatHourLabel(m.endHour)}${kind}${loc}`;
}

export interface ScheduleConflict {
  courseA: string;
  courseB: string;
  summary: string;
}

export interface ScheduleFitReport {
  /** IDs in the same order as input courses where found */
  courseIds: string[];
  /** Pairwise time overlaps (different courses) */
  conflicts: ScheduleConflict[];
  /** Subjects with no parsed meeting times in this catalog snapshot */
  missingTimes: string[];
  /** Subjects not found in the local course corpus */
  notFound: string[];
  /**
   * True only when every course has at least one meeting and there are zero conflicts.
   */
  timesCompatible: boolean;
  /**
   * True when we have meeting data for every course in the set (so overlap check is complete).
   */
  fullySpecified: boolean;
}

/**
 * Compares FireRoad-derived `Course.meetings` (same source as the catalog JSON).
 * Treats every listed meeting row as something the student might need to attend
 * (conservative overlap check vs. picking a single section).
 */
export function analyzeScheduleFit(
  requestedIds: string[],
  courseById: Map<string, Course>,
): ScheduleFitReport {
  const seen = new Set<string>();
  const courseIds: string[] = [];
  const courses: Course[] = [];
  const notFound: string[] = [];

  for (const raw of requestedIds) {
    const t = raw.trim();
    const c = resolveCourseFromMention(t, courseById);
    if (!c) {
      if (!notFound.includes(t)) notFound.push(t);
      continue;
    }
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    courseIds.push(c.id);
    courses.push(c);
  }

  const missingTimes = courses.filter((c) => c.meetings.length === 0).map((c) => c.id);
  const conflicts: ScheduleConflict[] = [];
  const expanded = courses.flatMap((c) => c.meetings.map((m) => ({ id: c.id, m })));

  for (let i = 0; i < expanded.length; i++) {
    for (let j = i + 1; j < expanded.length; j++) {
      if (expanded[i].id === expanded[j].id) continue;
      if (meetingsOverlap(expanded[i].m, expanded[j].m)) {
        conflicts.push({
          courseA: expanded[i].id,
          courseB: expanded[j].id,
          summary: `${expanded[i].id} (${formatMeetingLine(expanded[i].m)}) overlaps ${expanded[j].id} (${formatMeetingLine(expanded[j].m)})`,
        });
      }
    }
  }

  const fullySpecified =
    courses.length >= 2 && missingTimes.length === 0 && notFound.length === 0;
  const timesCompatible = fullySpecified && conflicts.length === 0;

  return {
    courseIds,
    conflicts,
    missingTimes,
    notFound,
    timesCompatible,
    fullySpecified,
  };
}

export function formatScheduleFitForPrompt(
  report: ScheduleFitReport,
  hydrantOk: boolean,
  hydrantTermKey?: string,
  semesterResolutionNote?: string,
): string {
  const lines: string[] = [
    "SCHEDULE / TIME-OVERLAP ANALYSIS (from Course Compass FireRoad meeting cache).",
    `Subjects analyzed: ${report.courseIds.join(", ") || "(none)"}`,
    "",
  ];
  if (semesterResolutionNote?.trim()) {
    lines.push(semesterResolutionNote.trim());
    lines.push("");
  }
  if (report.notFound.length) {
    lines.push(`Not in local catalog JSON (cannot load meetings): ${report.notFound.join(", ")}`);
    lines.push("");
  }
  if (report.missingTimes.length) {
    lines.push(
      `No parsed meeting times (TBA / not published in FireRoad snapshot): ${report.missingTimes.join(", ")}`,
    );
    lines.push("");
  }
  if (report.conflicts.length) {
    lines.push("TIME CONFLICTS (at least one overlapping pair of meetings):");
    for (const c of report.conflicts) lines.push(`- ${c.summary}`);
    lines.push("");
  } else if (report.fullySpecified && report.courseIds.length >= 2) {
    lines.push(
      "No overlapping meeting times detected among the listed meetings for these subjects.",
    );
    lines.push("");
  } else {
    lines.push(
      "Cannot fully confirm compatibility: some subjects lack meeting times in this snapshot, or fewer than two subjects were resolved.",
    );
    lines.push("");
  }
  lines.push(
    `Conclusion flags: fullySpecified=${report.fullySpecified}, timesCompatible=${report.timesCompatible}, conflictCount=${report.conflicts.length}`,
  );
  lines.push("");
  lines.push(
    `Hydrant term catalog fetch: ${hydrantOk ? "ok" : "failed"}${hydrantTermKey ? ` (term key ${hydrantTermKey})` : ""}.`,
  );
  lines.push(
    "The chat UI embeds **live MIT Hydrant** (hydrant.mit.edu) below the assistant reply with the same subjects and term used here.",
  );
  lines.push(
    "Always warn that official times, rooms, and sections can change — verify in Hydrant and the registrar.",
  );
  return lines.join("\n");
}

/**
 * Fetches the full MIT subject listing from the FireRoad API and writes a
 * normalized Course[] JSON file to data/build/courses.json.
 *
 * FireRoad is the same data source used by Hydrant and other MIT student
 * tools. Endpoint: https://fireroad.mit.edu/courses/all?full=true
 *
 * Run with:  npm run build:courses
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Course, MeetingTime, CourseIndex } from "../src/lib/data/types";

const FIREROAD_URL = "https://fireroad.mit.edu/courses/all?full=true";

interface FireRoadCourse {
  subject_id: string;
  title: string;
  description?: string;
  total_units?: number;
  level?: string;
  gir_attribute?: string;
  hass_attribute?: string;
  communication_requirement?: string;
  prerequisites?: string;
  corequisites?: string;
  offered_fall?: boolean;
  offered_spring?: boolean;
  offered_IAP?: boolean;
  offered_summer?: boolean;
  instructors?: string[];
  joint_subjects?: string[];
  meets_with_subjects?: string[];
  related_subjects?: string[];
  url?: string;
  rating?: number;
  schedule?: string;
  is_historical?: boolean;
  public?: boolean;
}

/**
 * Parses FireRoad's "schedule" string into a list of MeetingTime entries.
 *
 * Format (best-effort from FireRoad source):
 *   "Lecture,3-333/MW/0/10,3-333/MW/0/11;Lab,TBA"
 *   sections separated by ";", section header is the first token,
 *   then comma-separated meetings of "ROOM/DAYS/EVENING/HOUR[-END]"
 *   DAYS letters: M T W R F S U
 *   EVENING flag: 1 means PM (so add 12 to hour if hour < 12)
 *   HOUR can be "10", "10-12", "10.5", or with EVENING flag "1" → 13.
 *
 * Anything we can't parse confidently is dropped (we'd rather under-promise).
 */
function parseSchedule(scheduleRaw?: string): MeetingTime[] {
  if (!scheduleRaw) return [];
  const meetings: MeetingTime[] = [];
  for (const section of scheduleRaw.split(";")) {
    const parts = section.split(",");
    const kind = parts[0]?.trim();
    for (const meeting of parts.slice(1)) {
      const m = meeting.trim();
      if (!m || m.toUpperCase() === "TBA") continue;
      const tokens = m.split("/");
      if (tokens.length < 4) continue;
      const [room, daysStr, eveningStr, hourStr] = tokens;
      const evening = eveningStr === "1";
      const hourPart = hourStr.split("-");
      const startRaw = parseFloat(hourPart[0]);
      if (Number.isNaN(startRaw)) continue;
      const endRaw = hourPart.length > 1 ? parseFloat(hourPart[1]) : NaN;

      const start = adjustHour(startRaw, evening);
      // If no explicit end, assume 1-hour meetings (MIT convention is mostly
      // 50-minute lectures on the hour; we use 1 for simple grid layout).
      const computedEnd = Number.isNaN(endRaw)
        ? start + 1
        : adjustHour(endRaw, evening);
      const end = computedEnd > start ? computedEnd : start + 1;

      for (const dayChar of daysStr) {
        if (!"MTWRFSU".includes(dayChar)) continue;
        meetings.push({
          day: dayChar as MeetingTime["day"],
          startHour: start,
          endHour: end,
          location: room,
          kind,
        });
      }
    }
  }
  return meetings;
}

function adjustHour(hour: number, evening: boolean): number {
  // FireRoad encodes "1" with evening flag as 13:00 (1 PM).
  // Hours >= 12 are already 24-hour.
  if (evening && hour < 12) return hour + 12;
  return hour;
}

function departmentOf(subjectId: string): string {
  const dot = subjectId.indexOf(".");
  if (dot < 0) return subjectId;
  return subjectId.slice(0, dot);
}

function normalize(c: FireRoadCourse): Course | null {
  if (!c.subject_id || !c.title) return null;
  if (c.is_historical) return null;
  if (c.public === false) return null;

  const meetings = parseSchedule(c.schedule);

  const url =
    c.url && c.url.startsWith("http")
      ? c.url
      : `http://student.mit.edu/catalog/index.cgi?search=${encodeURIComponent(
          c.subject_id,
        )}`;

  return {
    id: c.subject_id,
    title: c.title,
    description: (c.description ?? "").trim(),
    totalUnits: c.total_units ?? 0,
    level: c.level === "G" ? "G" : "U",
    girAttribute: c.gir_attribute as Course["girAttribute"],
    hassAttribute: c.hass_attribute as Course["hassAttribute"],
    communicationRequirement:
      c.communication_requirement as Course["communicationRequirement"],
    prerequisitesRaw: c.prerequisites?.trim() || undefined,
    corequisitesRaw: c.corequisites?.trim() || undefined,
    offered: {
      fall: !!c.offered_fall,
      spring: !!c.offered_spring,
      iap: !!c.offered_IAP,
      summer: !!c.offered_summer,
    },
    instructors: c.instructors ?? [],
    jointSubjects: c.joint_subjects ?? [],
    meetsWith: c.meets_with_subjects ?? [],
    relatedSubjects: c.related_subjects ?? [],
    department: departmentOf(c.subject_id),
    catalogUrl: url,
    rating: typeof c.rating === "number" ? c.rating : undefined,
    meetings,
    scheduleRaw: c.schedule,
  };
}

/**
 * The MVP focuses on Course 6, but a Course 6 student also needs to plan
 * GIRs, HASS, and other cross-listed dependencies. We therefore keep:
 *   - All Course 6 subjects.
 *   - All subjects with a HASS attribute (for HASS planning).
 *   - All subjects with a CI-H or CI-HW attribute.
 *   - Math (18.x), Physics (8.x), Chemistry (5.x), Biology (7.x), Materials (3.x;
 *     e.g. 3.091 for the chemistry GIR) — common pre-reqs for Course 6 majors.
 *   - Comparative Media Studies (CMS.xxx), common HASS / breadth subjects.
 *   - Subjects cross-listed with any kept Course 6 subject.
 */
function shouldKeep(c: Course, course6Ids: Set<string>): boolean {
  if (c.department === "6") return true;
  if (c.hassAttribute) return true;
  if (c.communicationRequirement) return true;
  if (["18", "8", "5", "7", "3", "CMS"].includes(c.department)) return true;
  // Cross-listed with a Course 6 subject?
  if (c.jointSubjects.some((id) => course6Ids.has(id))) return true;
  if (c.meetsWith.some((id) => course6Ids.has(id))) return true;
  return false;
}

async function main() {
  const start = Date.now();
  console.log(`[fetch] FireRoad: ${FIREROAD_URL}`);
  const res = await fetch(FIREROAD_URL);
  if (!res.ok) {
    throw new Error(`FireRoad request failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as FireRoadCourse[];
  console.log(`[fetch] received ${raw.length} subjects`);

  const all: Course[] = [];
  for (const r of raw) {
    const n = normalize(r);
    if (n) all.push(n);
  }
  console.log(`[normalize] ${all.length} normalized`);

  const course6Ids = new Set(
    all.filter((c) => c.department === "6").map((c) => c.id),
  );
  const kept = all.filter((c) => shouldKeep(c, course6Ids));
  console.log(`[filter] kept ${kept.length} (Course 6 + HASS/CI + supports)`);

  kept.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const index: CourseIndex = {
    generatedAt: new Date().toISOString(),
    courses: kept,
  };

  const outDir = path.resolve(process.cwd(), "data/build");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "courses.json");
  await writeFile(outPath, JSON.stringify(index));
  const sizeMb = (JSON.stringify(index).length / 1_000_000).toFixed(2);
  console.log(
    `[write] ${outPath}  (${sizeMb} MB)  in ${Date.now() - start} ms`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

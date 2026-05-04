/**
 * Fetches Hydrant term JSON (same source as hydrant.mit.edu) for server-side
 * consumers (API route, chat schedule-fit flow).
 */

import type { MeetingTime } from "@/lib/data/types";

export interface HydrantSection {
  raw: string;
  kind: "lecture" | "recitation" | "lab" | "design";
}

interface HydrantCourse {
  number: string;
  name?: string;
  lectureRawSections?: string[];
  recitationRawSections?: string[];
  labRawSections?: string[];
  designRawSections?: string[];
  sectionKinds?: string[];
  tba?: boolean;
  terms?: string[];
  rating?: number;
  hours?: number;
  prereqs?: string;
  hass?: string[];
  gir?: string;
  comms?: string;
  level?: string;
}

interface HydrantData {
  termInfo: {
    urlName: string;
    startDate: string;
    endDate: string;
  };
  lastUpdated: string;
  classes: Record<string, HydrantCourse>;
}

/**
 * Hydrant sometimes serves the SPA shell as `{slug}.json` (200 + HTML) while
 * `latest.json` still exposes the same term via `termInfo.urlName`.
 */
async function loadHydrantJsonData(termSlug: string | null): Promise<HydrantData> {
  const primaryUrl = termSlug
    ? `https://hydrant.mit.edu/${termSlug}.json`
    : "https://hydrant.mit.edu/latest.json";

  const tryParse = async (jsonUrl: string): Promise<HydrantData | null> => {
    const res = await fetch(jsonUrl, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const trimmed = (await res.text()).trim();
    if (!trimmed.startsWith("{")) return null;
    try {
      const data = JSON.parse(trimmed) as HydrantData;
      if (!data.termInfo?.urlName) return null;
      return data;
    } catch {
      return null;
    }
  };

  const primary = await tryParse(primaryUrl);
  if (primary) {
    if (!termSlug || primary.termInfo.urlName === termSlug) return primary;
  }

  if (termSlug) {
    const latest = await tryParse("https://hydrant.mit.edu/latest.json");
    if (latest && latest.termInfo.urlName === termSlug) return latest;
  }

  throw new Error(
    termSlug
      ? `Hydrant catalog JSON for ${termSlug} was missing or not valid JSON (tried ${primaryUrl} and latest.json)`
      : "Hydrant latest.json was missing or invalid",
  );
}

const DAY_MAP: Record<string, MeetingTime["day"]> = {
  M: "M",
  T: "T",
  W: "W",
  R: "R",
  F: "F",
  S: "S",
};

function parseRawSection(raw: string, kind: string): MeetingTime[] {
  const parts = raw.split("/");
  if (parts.length < 4) return [];
  const [room, daysStr, , timeStr] = parts;
  if (!daysStr || !timeStr) return [];

  const days: MeetingTime["day"][] = [];
  for (const ch of daysStr) {
    if (ch in DAY_MAP) days.push(DAY_MAP[ch]);
  }
  if (days.length === 0) return [];

  const { start, end } = parseTime(timeStr);
  if (start === null || end === null) return [];

  return days.map((day) => ({
    day,
    startHour: start,
    endHour: end,
    location: room || undefined,
    kind: kind.charAt(0).toUpperCase() + kind.slice(1),
  }));
}

function parseTime(timeStr: string): { start: number | null; end: number | null } {
  const dotToDecimal = (s: string): number => {
    const [h, m] = s.split(".");
    return parseInt(h, 10) + (m ? parseInt(m, 10) / 60 : 0);
  };

  const toPm = (h: number): number => (h >= 1 && h <= 5 ? h + 12 : h);

  if (timeStr.includes("-")) {
    const [startStr, endStr] = timeStr.split("-");
    const start = dotToDecimal(startStr);
    const end = dotToDecimal(endStr);
    const resolvedEnd = end < start ? end + 12 : end;
    return { start: toPm(start), end: toPm(resolvedEnd) };
  }

  const h = dotToDecimal(timeStr);
  const start = toPm(h);
  return { start, end: start + 1 };
}

export interface HydrantResult {
  courseId: string;
  sections: HydrantSection[];
  meetings: MeetingTime[];
  tba: boolean;
  terms: string[];
  rating?: number;
}

export interface HydrantResponse {
  termInfo: HydrantData["termInfo"];
  lastUpdated: string;
  courses: HydrantResult[];
  termKey: string;
}

/**
 * @param ids — subject IDs (any casing)
 * @param term — optional archived term, e.g. "f25"; omit for latest.json
 */
export async function fetchHydrantForIds(
  ids: string[],
  term?: string | null,
): Promise<HydrantResponse> {
  const normalized = ids
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const data = await loadHydrantJsonData(term ?? null);

  const results: HydrantResult[] = normalized.map((id) => {
    const lower = id.toLowerCase();
    const c = data.classes[lower] ?? data.classes[id] ?? null;

    if (!c) {
      return {
        courseId: id,
        sections: [],
        meetings: [],
        tba: true,
        terms: [],
      };
    }

    const kindMap: [string[] | undefined, string][] = [
      [c.lectureRawSections, "lecture"],
      [c.recitationRawSections, "recitation"],
      [c.labRawSections, "lab"],
      [c.designRawSections, "design"],
    ];

    const sections: HydrantSection[] = [];
    const meetings: MeetingTime[] = [];

    for (const [raws, kind] of kindMap) {
      if (!raws) continue;
      for (const raw of raws) {
        sections.push({ raw, kind: kind as HydrantSection["kind"] });
        meetings.push(...parseRawSection(raw, kind));
      }
    }

    return {
      courseId: id,
      sections,
      meetings,
      tba: c.tba ?? false,
      terms: c.terms ?? [],
      rating: c.rating,
    };
  });

  return {
    termInfo: data.termInfo,
    lastUpdated: data.lastUpdated,
    courses: results,
    termKey: data.termInfo.urlName,
  };
}

/**
 * Subject IDs (lowercase) that appear in Hydrant’s archived term JSON — authoritative
 * for “is this class offered this term” vs FireRoad’s coarse fall/spring flags.
 */
export async function getHydrantClassIdSetForTerm(termSlug: string): Promise<Set<string> | null> {
  try {
    const data = await loadHydrantJsonData(termSlug);
    const set = new Set<string>();
    for (const k of Object.keys(data.classes ?? {})) {
      set.add(k.toLowerCase());
    }
    return set;
  } catch {
    return null;
  }
}

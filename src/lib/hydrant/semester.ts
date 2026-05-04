/**
 * Parse which academic term the student means (Hydrant / MIT semester).
 * Requires an explicit calendar year or a Hydrant-style term slug (f26, s27).
 */

import { fetchHydrantForIds } from "@/lib/hydrant/fetchCatalog";

export type CatalogSeason = "fall" | "spring" | "iap" | "summer";

const SEASON_WORDS: Record<string, CatalogSeason> = {
  fall: "fall",
  autumn: "fall",
  spring: "spring",
  summer: "summer",
  iap: "iap",
};

function slugLetter(season: CatalogSeason): string {
  switch (season) {
    case "fall":
      return "f";
    case "spring":
      return "s";
    case "iap":
      return "i";
    case "summer":
      return "m";
  }
}

/** Hydrant JSON filenames: f26 = Fall term keyed to calendar year 2026, s26 = Spring 2026, etc. */
export function hydrantSlugForYear(season: CatalogSeason, year: number): string {
  const yy = String(year % 100).padStart(2, "0");
  return `${slugLetter(season)}${yy}`;
}

function seasonFromSlugLetter(ch: string): CatalogSeason | null {
  const c = ch.toLowerCase();
  if (c === "f") return "fall";
  if (c === "s") return "spring";
  if (c === "i") return "iap";
  if (c === "m") return "summer";
  return null;
}

/**
 * Returns null if the question does not name a specific term (year or f26-style slug).
 * Relative phrases like "this fall" are intentionally ignored so we can ask the student.
 */
export function parseSemesterMention(question: string): { season: CatalogSeason; year: number } | null {
  const s = question.replace(/\s+/g, " ");

  const slug = s.match(/\b([fsim])(\d{2})\b/i);
  if (slug) {
    const letter = slug[1];
    const yy = parseInt(slug[2], 10);
    const season = seasonFromSlugLetter(letter);
    if (!season) return null;
    const year = 2000 + yy;
    return { season, year };
  }

  let m = s.match(/\b(fall|autumn|spring|summer|iap)\b[^0-9]{0,12}\b(20\d{2})\b/i);
  if (m) {
    const w = m[1].toLowerCase();
    const season = SEASON_WORDS[w];
    if (!season) return null;
    return { season, year: parseInt(m[2], 10) };
  }

  m = s.match(/\b(20\d{2})\b[^0-9]{0,12}\b(fall|autumn|spring|summer|iap)\b/i);
  if (m) {
    const w = m[2].toLowerCase();
    const season = SEASON_WORDS[w];
    if (!season) return null;
    return { season, year: parseInt(m[1], 10) };
  }

  return null;
}

/**
 * Uses the current message first, then walks chat history (newest → oldest)
 * so follow-ups like “swap 6.1020 for 6.5110” still pick up **Fall 2026**
 * from the earlier message.
 */
export function parseSemesterMentionWithHistory(
  question: string,
  history: readonly { role: string; content: string }[],
): { season: CatalogSeason; year: number } | null {
  const direct = parseSemesterMention(question);
  if (direct) return direct;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = parseSemesterMention(history[i]?.content ?? "");
    if (m) return m;
  }
  return null;
}

export function formatSemesterLabel(sem: { season: CatalogSeason; year: number }): string {
  const cap =
    sem.season === "iap"
      ? "IAP"
      : sem.season.charAt(0).toUpperCase() + sem.season.slice(1);
  return `${cap} ${sem.year}`;
}

export interface ResolvedHydrantTerm {
  slug: string;
  /** Human-readable term the student asked for */
  requestedLabel: string;
  /** Non-empty when we had to use an older Hydrant JSON than requested */
  fallbackNote: string;
}

/**
 * Picks a Hydrant `*.json` slug that actually returns course data.
 * If the exact term is missing (common for far-future semesters), walks **backward**
 * year-by-year for the same season until a load succeeds, then falls back to `latest.json`.
 */
export async function resolveHydrantTermSlug(sem: {
  season: CatalogSeason;
  year: number;
}): Promise<ResolvedHydrantTerm> {
  const requestedLabel = formatSemesterLabel(sem);
  const maxAttempts = 40;

  for (let k = 0; k < maxAttempts; k++) {
    const year = sem.year - k;
    if (year < 1995) break;
    const slug = hydrantSlugForYear(sem.season, year);
    try {
      await fetchHydrantForIds([], slug);
      const usedLabel = formatSemesterLabel({ season: sem.season, year });
      const fallbackNote =
        k === 0
          ? ""
          : `Hydrant does not publish catalog JSON for **${requestedLabel}**. Using the nearest older term **${slug}** (${usedLabel}) instead.`;
      return { slug, requestedLabel, fallbackNote };
    } catch {
      /* try next older year */
    }
  }

  const latest = await fetchHydrantForIds([]);
  return {
    slug: latest.termKey,
    requestedLabel,
    fallbackNote: `Could not load Hydrant data for **${requestedLabel}** (or nearby years). Using Hydrant's default term **${latest.termKey}** instead.`,
  };
}

/**
 * Build Hydrant-compatible share URLs (?s=…) using the same msgpack + base64
 * encoding as sipb/hydrant (`src/lib/utils.tsx` urlencode).
 *
 * @see https://github.com/sipb/hydrant/blob/main/src/lib/state.ts deflate/inflate
 */

import { pack } from "msgpackr";

/** Lowercase — matches keys we store from Hydrant JSON (`getHydrantClassIdSetForTerm`). */
export function normalizeHydrantCourseId(id: string): string {
  return id.trim().toLowerCase();
}

/**
 * Subject numbers for Hydrant share URLs must match `State.classes` Map keys
 * from term JSON (e.g. **CMS.303**). Lowercasing breaks letter departments.
 */
function hydrantShareCourseNumber(id: string): string {
  return id.trim();
}

/**
 * Minimal per-class deflate: unlocked sections → `[courseNumber]` array.
 * Hydrant's Class.inflate accepts this and leaves section locks unset.
 */
function deflateClass(courseNumber: string): string[] {
  return [courseNumber];
}

/**
 * Full program deflate matching State.deflate():
 * `[classes, customActivities, selectedOption, peClasses]`
 */
export function buildHydrantDeflate(courseNumbers: string[]): unknown[] {
  const normalized = courseNumbers.map(hydrantShareCourseNumber).filter(Boolean);
  const classes = normalized.map((n) => deflateClass(n));
  return [classes, null, 0, []];
}

export function urlencodeHydrant(obj: unknown): string {
  const bytes = pack(obj);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin);
}

/**
 * Returns a URL that opens Hydrant with the given courses pre-added.
 *
 * @param termPassThrough — optional `t=` param (e.g. `f26`). Omit to use Hydrant's default / latest term.
 */
export function buildHydrantScheduleUrl(courseIds: string[], termPassThrough?: string): string {
  const deflate = buildHydrantDeflate(courseIds);
  const encoded = urlencodeHydrant(deflate);
  const url = new URL("https://hydrant.mit.edu/");
  if (termPassThrough) {
    url.searchParams.set("t", termPassThrough);
  }
  url.searchParams.set("s", encoded);
  return url.href;
}

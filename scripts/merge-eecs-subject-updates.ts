/**
 * Merges 6.Sxxx (EECS special subjects) from official Subject Updates pages into
 * data/build/courses.json after FireRoad. Source hub:
 * https://www.eecs.mit.edu/academics/subject-updates/
 *
 * Run automatically after fetch-courses via npm run build:courses, or:
 *   npx tsx scripts/merge-eecs-subject-updates.ts
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Course, CourseIndex } from "../src/lib/data/types";

const OUT_DIR = path.resolve(process.cwd(), "data/build");
const COURSES_PATH = path.join(OUT_DIR, "courses.json");

/** Semester pages under Subject Updates (6.S listings use <h6 class="wp-block-heading">). */
const SUBJECT_UPDATE_URLS: string[] = [
  "https://www.eecs.mit.edu/academics/subject-updates/subject-updates-spring-2026/",
  "https://www.eecs.mit.edu/academics/subject-updates/subjects-update-fall-2025/",
  "https://www.eecs.mit.edu/?page_id=8193",
  "https://www.eecs.mit.edu/academics/subject-updates/special-subjects-spring-2025/",
  "https://www.eecs.mit.edu/academics/subject-updates/subject-updates-fall-2024/",
  "https://www.eecs.mit.edu/academics/subject-updates/subject-updates-spring-2024/",
  "https://www.eecs.mit.edu/academics/subject-updates/subject-updates-fall-2023/",
  "https://www.eecs.mit.edu/academics/subject-updates/subject-updates-spring-2023/",
  "https://www.eecs.mit.edu/academics/subject-updates/subject-updates-fall-2022/",
  "https://www.eecs.mit.edu/academics/subject-updates/subject-updates-spring-2022/",
  "https://www.eecs.mit.edu/academics/subject-updates/subject-updates-fall-2021/",
];

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "–");
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/** Which term flag(s) this page describes (best-effort from URL copy). */
function offeredFromPageUrl(url: string): Course["offered"] {
  const base = { fall: false, spring: false, iap: false, summer: false };
  const u = url.toLowerCase();
  if (u.includes("iap")) return { ...base, iap: true };
  if (u.includes("spring") || u.includes("page_id=8193"))
    return { ...base, spring: true };
  if (u.includes("fall") || u.includes("subjects-update-fall"))
    return { ...base, fall: true };
  if (u.includes("summer")) return { ...base, summer: true };
  return base;
}

function mergeOffered(
  a: Course["offered"],
  b: Course["offered"],
): Course["offered"] {
  return {
    fall: a.fall || b.fall,
    spring: a.spring || b.spring,
    iap: a.iap || b.iap,
    summer: a.summer || b.summer,
  };
}

/** Parse "6.S042/6.5820 Title Here" → primary 6.S042, joints, short title. */
function parseHeading(headingRaw: string): {
  primary: string;
  jointSubjects: string[];
  title: string;
} | null {
  const heading = decodeHtmlEntities(headingRaw).replace(/\s+/g, " ").trim();
  const m = heading.match(
    /^(6\.(?:[^\s/]+))((?:\/6\.(?:[^\s/]+))*)\s+(.+)$/,
  );
  if (!m) return null;
  const primary = m[1];
  if (!primary.startsWith("6.S")) return null;
  const jointSubjects = (m[2] ?? "")
    .split("/")
    .filter((x) => x.length > 0 && x.startsWith("6."));
  const title = m[3].trim();
  return { primary, jointSubjects, title };
}

function parseUnitsAndMeta(plain: string): {
  totalUnits: number;
  level: "U" | "G";
  prerequisitesRaw?: string;
} {
  let totalUnits = 12;
  const unitsM = plain.match(/Units:\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/i);
  if (unitsM) {
    totalUnits =
      Number(unitsM[1]) + Number(unitsM[2]) + Number(unitsM[3]);
  }
  let level: "U" | "G" = "U";
  const levelM = plain.match(/Level:\s*([^\n]+)/i);
  if (levelM) {
    const L = levelM[1].trim().toLowerCase();
    if (/\bu\/g\b|undergraduate\s*\/\s*graduate/.test(L)) level = "U";
    else if (/^g\b|^graduate\b|^\s*g\s*$/.test(L)) level = "G";
    else if (/\bgraduate\b/.test(L) && !/\bundergraduate\b/.test(L)) level = "G";
  }
  const pre = plain.match(/Prereqs?:\s*([^\n]+)/i);
  return {
    totalUnits,
    level,
    prerequisitesRaw: pre?.[1]?.trim() || undefined,
  };
}

function extractDescription(blockHtml: string): string {
  const text = stripHtml(blockHtml);
  const idx = text.search(/\bDescription\b/i);
  if (idx === -1) return "";
  let rest = text.slice(idx).replace(/^\s*Description\s*/i, "").trim();
  rest = rest.replace(/^[\s:–-]+/, "");
  const cut = rest.search(
    /\n---|More information can be found|^\s*Enrollment limited\.?\s*$/im,
  );
  if (cut !== -1) rest = rest.slice(0, cut);
  return rest.trim().slice(0, 6000);
}

interface ParsedSpecial {
  primary: string;
  jointSubjects: string[];
  title: string;
  description: string;
  totalUnits: number;
  level: "U" | "G";
  prerequisitesRaw?: string;
}

function parseSubjectUpdateHtml(html: string): ParsedSpecial[] {
  const re = /<h6 class="wp-block-heading">([^<]*)<\/h6>/gi;
  const matches: { heading: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    matches.push({ heading: m[1], index: m.index });
  }
  const out: ParsedSpecial[] = [];
  for (let i = 0; i < matches.length; i++) {
    const heading = matches[i].heading;
    const parsed = parseHeading(heading);
    if (!parsed) continue;
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : html.length;
    const blockHtml = html.slice(start, end);
    const description = extractDescription(blockHtml);
    const plain = stripHtml(blockHtml);
    const meta = parseUnitsAndMeta(plain);
    out.push({
      ...parsed,
      description:
        description ||
        `${parsed.title}. (Offerings merged from MIT EECS Subject Updates.)`,
      totalUnits: meta.totalUnits,
      level: meta.level,
      prerequisitesRaw: meta.prerequisitesRaw,
    });
  }
  return out;
}

function toCourse(p: ParsedSpecial, offered: Course["offered"]): Course {
  const catalogUrl = `http://student.mit.edu/catalog/index.cgi?search=${encodeURIComponent(p.primary)}`;
  return {
    id: p.primary,
    title: p.title,
    description: p.description,
    totalUnits: p.totalUnits,
    level: p.level,
    prerequisitesRaw: p.prerequisitesRaw,
    offered,
    instructors: [],
    jointSubjects: p.jointSubjects,
    meetsWith: [],
    relatedSubjects: [],
    department: "6",
    catalogUrl,
    meetings: [],
  };
}

function preferSpecialSubjectTitle(
  existing: string,
  incoming: string,
): string {
  const generic =
    /^Special Subject in /i.test(existing.trim()) &&
    existing.trim().length < 96;
  if (generic && !/^Special Subject in /i.test(incoming.trim()))
    return incoming;
  if (incoming.trim().length > existing.trim().length + 8) return incoming;
  return existing;
}

async function main() {
  const start = Date.now();
  const raw = await readFile(COURSES_PATH, "utf-8");
  const index = JSON.parse(raw) as CourseIndex;
  const byId = new Map<string, Course>(
    index.courses.map((c) => [c.id, c]),
  );

  let pagesFetched = 0;
  let specialsParsed = 0;

  for (const url of SUBJECT_UPDATE_URLS) {
    let html: string;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "CourseCompass/merge-eecs-subject-updates" },
      });
      if (!res.ok) {
        console.warn(`[eecs-updates] skip ${res.status}: ${url}`);
        continue;
      }
      html = await res.text();
    } catch (e) {
      console.warn(`[eecs-updates] fetch failed ${url}:`, e);
      continue;
    }
    pagesFetched++;
    const offeredPage = offeredFromPageUrl(url);
    const list = parseSubjectUpdateHtml(html);
    specialsParsed += list.length;

    for (const p of list) {
      const incoming = toCourse(p, offeredPage);
      const existing = byId.get(incoming.id);
      if (!existing) {
        byId.set(incoming.id, incoming);
        continue;
      }
      byId.set(incoming.id, {
        ...existing,
        title: preferSpecialSubjectTitle(existing.title, incoming.title),
        description:
          existing.description.length >= incoming.description.length
            ? existing.description
            : incoming.description,
        totalUnits: existing.totalUnits || incoming.totalUnits,
        level: existing.level ?? incoming.level,
        prerequisitesRaw:
          existing.prerequisitesRaw ?? incoming.prerequisitesRaw,
        offered: mergeOffered(existing.offered, incoming.offered),
        jointSubjects: [
          ...new Set([...existing.jointSubjects, ...incoming.jointSubjects]),
        ],
      });
    }
  }

  const courses = [...byId.values()].sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
  index.generatedAt = new Date().toISOString();
  index.courses = courses;

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(COURSES_PATH, JSON.stringify(index));

  console.log(
    `[eecs-updates] pages=${pagesFetched} blocks=${specialsParsed} courses=${courses.length} written ${COURSES_PATH} (${Date.now() - start} ms)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * POST /api/progress
 * Body: { majorId: string, completedCourseIds: string[] }
 * Returns a ProgressReport for the given major.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCourses } from "@/lib/data/store";
import { evaluateMajor } from "@/lib/requirements/engine";
import { getMajor, CATALOG_YEARS } from "@/lib/requirements/data";

export const runtime = "nodejs";

const Body = z.object({
  majorId: z.string(),
  catalogYear: z.enum(CATALOG_YEARS).default("2026-2027"),
  completedCourseIds: z.array(z.string()).default([]),
  overriddenRequirementIds: z.array(z.string()).default([]),
  manualAssignments: z.record(z.string(), z.array(z.string())).default({}),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: "Bad request", details: String(err) }, { status: 400 });
  }

  const major = getMajor(parsed.majorId, parsed.catalogYear);
  if (!major) {
    return NextResponse.json(
      { error: `Unknown major ${parsed.majorId} for catalog year ${parsed.catalogYear}` },
      { status: 404 },
    );
  }

  const corpus = await getCourses();
  const report = evaluateMajor(
    major,
    parsed.completedCourseIds,
    corpus,
    new Set(parsed.overriddenRequirementIds),
    new Map(Object.entries(parsed.manualAssignments)),
  );
  return NextResponse.json(report);
}

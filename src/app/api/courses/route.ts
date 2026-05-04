/**
 * GET /api/courses?q=<query>&dept=6&limit=20
 * Lightweight course search used by the schedule planner.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCourses } from "@/lib/data/store";

export const runtime = "nodejs";

const Query = z.object({
  q: z.string().optional().default(""),
  dept: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Query.safeParse({
    q: url.searchParams.get("q") ?? "",
    dept: url.searchParams.get("dept") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad query" }, { status: 400 });
  }
  const { q, dept, limit } = parsed.data;

  const courses = await getCourses();
  const queryLower = q.trim().toLowerCase();

  let filtered = courses;
  if (dept) filtered = filtered.filter((c) => c.department === dept);

  if (queryLower) {
    filtered = filtered.filter(
      (c) =>
        c.id.toLowerCase().includes(queryLower) ||
        c.title.toLowerCase().includes(queryLower),
    );
    // Sort by id-prefix match first, then title-prefix.
    filtered.sort((a, b) => {
      const aId = a.id.toLowerCase().startsWith(queryLower) ? 0 : 1;
      const bId = b.id.toLowerCase().startsWith(queryLower) ? 0 : 1;
      if (aId !== bId) return aId - bId;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  } else {
    filtered = filtered.slice(0, limit);
  }

  return NextResponse.json({
    courses: filtered.slice(0, limit),
  });
}

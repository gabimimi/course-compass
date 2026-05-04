/**
 * Server-side proxy for Hydrant (https://hydrant.mit.edu/).
 *
 * Hydrant's latest.json lacks CORS headers, so we fetch it here and cache
 * it at the edge for 1 hour (matching Hydrant's own update frequency).
 *
 * GET /api/hydrant?ids=6.1010,6.1200  — returns Hydrant section data for the
 *   requested course IDs, plus the current term info.
 * GET /api/hydrant?ids=6.1010&term=f25 — use an archived term (e.g. "f25").
 */
import { NextResponse } from "next/server";
import { fetchHydrantForIds } from "@/lib/hydrant/fetchCatalog";

export type { HydrantResponse, HydrantResult, HydrantSection } from "@/lib/hydrant/fetchCatalog";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get("ids") ?? "";
  const term = searchParams.get("term");

  const ids = idsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  try {
    const response = await fetchHydrantForIds(ids, term);
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

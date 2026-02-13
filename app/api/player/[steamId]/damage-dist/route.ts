import { db } from "@/lib/db";
import { getSeasonFilter, appendDateFilter } from "@/lib/seasons";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ steamId: string }> }) {
  const { steamId } = await params;
  const filter = getSeasonFilter(req.nextUrl.searchParams);
  const args: (string | number)[] = [steamId];
  const sql = appendDateFilter(
    `SELECT
      CASE
        WHEN damage < 100 THEN '0-99'
        WHEN damage < 200 THEN '100-199'
        WHEN damage < 300 THEN '200-299'
        WHEN damage < 400 THEN '300-399'
        WHEN damage < 500 THEN '400-499'
        WHEN damage < 600 THEN '500-599'
        WHEN damage < 700 THEN '600-699'
        ELSE '700+'
      END as damage_range,
      COUNT(*) as count
    FROM pat_ranked_feed WHERE steam_id = ? AND damage IS NOT NULL`,
    args, filter
  ) + " GROUP BY damage_range ORDER BY damage_range";

  const result = await db.execute({ sql, args });
  return NextResponse.json(result.rows);
}

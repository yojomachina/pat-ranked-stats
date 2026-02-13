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
      date,
      COUNT(DISTINCT match_id) as matches,
      SUM(CASE WHEN side = 'winner' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN side = 'loser' THEN 1 ELSE 0 END) as losses,
      SUM(kills) as total_kills,
      SUM(deaths) as total_deaths,
      ROUND(AVG(damage), 0) as avg_damage,
      MIN(elo) as min_elo,
      MAX(elo) as max_elo,
      SUM(elo_change) as elo_change
    FROM pat_ranked_feed WHERE steam_id = ?`,
    args, filter
  ) + " GROUP BY date ORDER BY date DESC";

  const result = await db.execute({ sql, args });
  return NextResponse.json(result.rows);
}

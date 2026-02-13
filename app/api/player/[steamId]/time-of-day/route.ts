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
        WHEN CAST(SUBSTR(time_utc, 1, 2) AS INTEGER) >= 0 AND CAST(SUBSTR(time_utc, 1, 2) AS INTEGER) < 4 THEN '6-10 PM CST'
        WHEN CAST(SUBSTR(time_utc, 1, 2) AS INTEGER) >= 4 AND CAST(SUBSTR(time_utc, 1, 2) AS INTEGER) < 8 THEN '10 PM-2 AM CST'
        WHEN CAST(SUBSTR(time_utc, 1, 2) AS INTEGER) >= 8 AND CAST(SUBSTR(time_utc, 1, 2) AS INTEGER) < 12 THEN '2-6 AM CST'
        WHEN CAST(SUBSTR(time_utc, 1, 2) AS INTEGER) >= 16 AND CAST(SUBSTR(time_utc, 1, 2) AS INTEGER) < 20 THEN '10 AM-2 PM CST'
        ELSE 'Other'
      END as time_block,
      COUNT(DISTINCT match_id) as matches,
      SUM(CASE WHEN side = 'winner' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN side = 'loser' THEN 1 ELSE 0 END) as losses,
      SUM(kills) as total_kills,
      SUM(deaths) as total_deaths
    FROM pat_ranked_feed WHERE steam_id = ? AND time_utc IS NOT NULL`,
    args, filter
  ) + " GROUP BY time_block HAVING time_block != 'Other' ORDER BY CASE time_block WHEN '6-10 PM CST' THEN 1 WHEN '10 PM-2 AM CST' THEN 2 WHEN '2-6 AM CST' THEN 3 WHEN '10 AM-2 PM CST' THEN 4 END";

  const result = await db.execute({ sql, args });
  return NextResponse.json(result.rows);
}

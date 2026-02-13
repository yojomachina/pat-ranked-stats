import { db } from "@/lib/db";
import { getSeasonFilter, appendDateFilter } from "@/lib/seasons";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ steamId: string }> }) {
  const { steamId } = await params;
  const filter = getSeasonFilter(req.nextUrl.searchParams);
  const args: (string | number)[] = [steamId];
  const sql = appendDateFilter(
    `SELECT date, time_utc, elo, side, match_id, elo_change FROM pat_ranked_feed WHERE steam_id = ?`,
    args, filter
  ) + " ORDER BY date ASC, time_utc ASC";

  const result = await db.execute({ sql, args });
  return NextResponse.json(result.rows);
}

import { db } from "@/lib/db";
import { getSeasonFilter, appendDateFilter } from "@/lib/seasons";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ steamId: string }> }) {
  const { steamId } = await params;
  const filter = getSeasonFilter(req.nextUrl.searchParams);
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = 50;
  const offset = (page - 1) * limit;

  const args: (string | number)[] = [steamId];
  const sql = appendDateFilter(
    `SELECT match_id, match_type, date, time_utc, side, rounds_won, rounds_total,
      kills, deaths, elo, elo_change, damage
    FROM pat_ranked_feed WHERE steam_id = ?`,
    args, filter
  ) + " ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?";
  args.push(limit, offset);

  const result = await db.execute({ sql, args });
  return NextResponse.json(result.rows);
}

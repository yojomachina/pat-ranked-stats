import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const [players, matches, dateRange] = await Promise.all([
    db.execute("SELECT COUNT(DISTINCT steam_id) as count FROM pat_ranked_feed"),
    db.execute("SELECT COUNT(DISTINCT match_id) as count FROM pat_ranked_feed"),
    db.execute("SELECT MIN(date) as min_date, MAX(date) as max_date FROM pat_ranked_feed"),
  ]);
  return NextResponse.json({
    totalPlayers: players.rows[0]?.count ?? 0,
    totalMatches: matches.rows[0]?.count ?? 0,
    minDate: dateRange.rows[0]?.min_date ?? null,
    maxDate: dateRange.rows[0]?.max_date ?? null,
  });
}

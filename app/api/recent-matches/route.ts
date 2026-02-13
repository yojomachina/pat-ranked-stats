import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 100), 200);

  const result = await db.execute({
    sql: `SELECT 
        w.match_id, w.date, w.time_utc, w.match_type,
        w.player_name as winner_name, w.steam_id as winner_id, w.elo as winner_elo, w.elo_change as winner_elo_change,
        w.kills as winner_kills, w.deaths as winner_deaths, w.damage as winner_damage, w.rounds_won as winner_rounds,
        l.player_name as loser_name, l.steam_id as loser_id, l.elo as loser_elo, l.elo_change as loser_elo_change,
        l.kills as loser_kills, l.deaths as loser_deaths, l.damage as loser_damage, l.rounds_won as loser_rounds
      FROM pat_ranked_feed w
      JOIN pat_ranked_feed l ON w.match_id = l.match_id AND w.steam_id != l.steam_id
      WHERE w.side = 'winner' AND l.side = 'loser'
      ORDER BY w.date DESC, w.time_utc DESC
      LIMIT ?`,
    args: [limit],
  });

  return NextResponse.json(result.rows);
}

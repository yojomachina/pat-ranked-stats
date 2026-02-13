import { db } from "@/lib/db";
import { getSeasonFilter } from "@/lib/seasons";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ steamId: string }> }) {
  const { steamId } = await params;
  const filter = getSeasonFilter(req.nextUrl.searchParams);

  // Disconnect detection: when winner_rounds + loser_rounds < rounds_total,
  // someone left early. The loser (with 0 rounds typically) disconnected.

  const args: (string | number)[] = [steamId, steamId];
  let dateFilter = "";
  if (filter.fromDate) { dateFilter += " AND me.date >= ?"; args.push(filter.fromDate); }
  if (filter.toDate) { dateFilter += " AND me.date < ?"; args.push(filter.toDate); }

  const sql = `SELECT me.match_id, me.date, me.side as my_side,
      me.rounds_won as my_rounds, me.rounds_total,
      me.elo as my_elo,
      opp.player_name as opp_name, opp.steam_id as opp_steam_id, opp.elo as opp_elo,
      opp.rounds_won as opp_rounds
    FROM pat_ranked_feed me
    JOIN pat_ranked_feed opp ON me.match_id = opp.match_id AND me.steam_id != opp.steam_id
    WHERE me.steam_id = ? AND opp.steam_id != ?
      AND (me.rounds_won + opp.rounds_won) < me.rounds_total
      ${dateFilter}
    ORDER BY me.date DESC`;

  const [matchRes, banRes] = await Promise.all([
    db.execute({ sql, args }),
    db.execute({ sql: "SELECT steam_id, vac_banned, number_of_vac_bans, number_of_game_bans, days_since_last_ban FROM player_bans", args: [] }),
  ]);

  const banMap: Record<string, { vac: number; vac_count: number; game: number; days: number }> = {};
  banRes.rows.forEach(r => {
    banMap[String(r.steam_id)] = {
      vac: Number(r.vac_banned) || 0, vac_count: Number(r.number_of_vac_bans) || 0,
      game: Number(r.number_of_game_bans) || 0, days: Number(r.days_since_last_ban) || 0,
    };
  });

  function classify(myRounds: number, oppRounds: number): string {
    if (myRounds <= 1 && oppRounds === 0) return "Quit at Start";
    if (myRounds === oppRounds) return "Quit While Tied";
    return "Rage-Quit";
  }

  const byPlayerDetails: any[] = [];
  const againstPlayerDetails: any[] = [];

  matchRes.rows.forEach(r => {
    const myRounds = Number(r.my_rounds);
    const oppRounds = Number(r.opp_rounds);
    const mySide = String(r.my_side);

    const detail = {
      match_id: r.match_id, date: r.date,
      opp_name: r.opp_name, opp_steam_id: r.opp_steam_id, opp_elo: Number(r.opp_elo),
      score: `${myRounds}-${oppRounds}`,
      type: classify(mySide === "winner" ? myRounds : oppRounds, mySide === "winner" ? oppRounds : myRounds),
      bans: banMap[String(r.opp_steam_id)] || null,
    };

    if (mySide === "loser") {
      byPlayerDetails.push(detail);
    } else {
      againstPlayerDetails.push(detail);
    }
  });

  return NextResponse.json({
    byPlayer: byPlayerDetails.length,
    againstPlayer: againstPlayerDetails.length,
    byPlayerDetails,
    againstPlayerDetails,
  });
}

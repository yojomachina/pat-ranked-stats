import { db } from "@/lib/db";
import { getSeasonFilter } from "@/lib/seasons";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ steamId: string }> }) {
  const { steamId } = await params;
  const filter = getSeasonFilter(req.nextUrl.searchParams);

  const args: (string | number)[] = [steamId, steamId];
  let dateFilterMe = "";
  let dateFilterOpp = "";
  if (filter.fromDate) {
    dateFilterMe += " AND me.date >= ?"; args.push(filter.fromDate);
    dateFilterOpp += " AND opp.date >= ?"; args.push(filter.fromDate);
  }
  if (filter.toDate) {
    dateFilterMe += " AND me.date < ?"; args.push(filter.toDate);
    dateFilterOpp += " AND opp.date < ?"; args.push(filter.toDate);
  }

  const result = await db.execute({
    sql: `SELECT
      opp.steam_id,
      opp.player_name,
      COUNT(DISTINCT opp.match_id) as times_faced,
      SUM(CASE WHEN me.side = 'winner' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN me.side = 'loser' THEN 1 ELSE 0 END) as losses,
      MAX(opp.elo) as opp_peak_elo,
      SUM(opp.kills) as opp_kills,
      SUM(opp.deaths) as opp_deaths
    FROM pat_ranked_feed me
    JOIN pat_ranked_feed opp ON me.match_id = opp.match_id AND me.side != opp.side
    WHERE me.steam_id = ? AND opp.steam_id != ?${dateFilterMe}${dateFilterOpp}
    GROUP BY opp.steam_id
    ORDER BY times_faced DESC`,
    args,
  });

  // Get ban data for all opponents
  const oppIds = result.rows.map(r => String(r.steam_id));
  let banMap: Record<string, { vac: number; vac_count: number; game: number; days: number }> = {};
  if (oppIds.length > 0) {
    const banRes = await db.execute({
      sql: "SELECT steam_id, vac_banned, number_of_vac_bans, number_of_game_bans, days_since_last_ban FROM player_bans",
      args: [],
    });
    banRes.rows.forEach(r => {
      banMap[String(r.steam_id)] = {
        vac: Number(r.vac_banned) || 0,
        vac_count: Number(r.number_of_vac_bans) || 0,
        game: Number(r.number_of_game_bans) || 0,
        days: Number(r.days_since_last_ban) || 0,
      };
    });
  }

  const rows = result.rows.map(r => ({
    ...r,
    bans: banMap[String(r.steam_id)] || null,
  }));

  return NextResponse.json(rows);
}

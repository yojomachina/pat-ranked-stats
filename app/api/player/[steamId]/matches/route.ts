import { db } from "@/lib/db";
import { getSeasonFilter, appendDateFilter } from "@/lib/seasons";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ steamId: string }> }) {
  const { steamId } = await params;
  const filter = getSeasonFilter(req.nextUrl.searchParams);
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = 25;
  const offset = (page - 1) * limit;

  // Get matches with opponent info
  const args: (string | number)[] = [steamId, steamId];
  let dateFilter = "";
  if (filter.fromDate) { dateFilter += " AND me.date >= ?"; args.push(filter.fromDate); }
  if (filter.toDate) { dateFilter += " AND me.date < ?"; args.push(filter.toDate); }

  // Count total
  const countArgs = [...args];
  const countSql = `SELECT COUNT(*) as total FROM pat_ranked_feed me
    JOIN pat_ranked_feed opp ON me.match_id = opp.match_id AND me.steam_id != opp.steam_id
    WHERE me.steam_id = ? AND opp.steam_id != ?${dateFilter}`;

  const sql = `SELECT me.match_id, me.date, me.time_utc, me.side, me.rounds_won, me.rounds_total,
      me.kills, me.deaths, me.elo, me.elo_change, me.damage,
      opp.player_name as opp_name, opp.steam_id as opp_steam_id, opp.elo as opp_elo,
      opp.kills as opp_kills, opp.deaths as opp_deaths, opp.rounds_won as opp_rounds
    FROM pat_ranked_feed me
    JOIN pat_ranked_feed opp ON me.match_id = opp.match_id AND me.steam_id != opp.steam_id
    WHERE me.steam_id = ? AND opp.steam_id != ?${dateFilter}
    ORDER BY me.date ASC, me.time_utc ASC
    LIMIT ? OFFSET ?`;
  args.push(limit, offset);

  const [matchRes, countRes] = await Promise.all([
    db.execute({ sql, args }),
    db.execute({ sql: countSql, args: countArgs }),
  ]);

  const total = Number(countRes.rows[0].total);

  return NextResponse.json({
    matches: matchRes.rows,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

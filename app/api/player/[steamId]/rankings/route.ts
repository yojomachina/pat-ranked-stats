import { db } from "@/lib/db";
import { getSeasonFilter, appendDateFilter } from "@/lib/seasons";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ steamId: string }> }) {
  const { steamId } = await params;
  const filter = getSeasonFilter(req.nextUrl.searchParams);

  // Get this player's peak ELO and stats first
  const playerArgs: (string | number)[] = [steamId];
  const playerSql = appendDateFilter(
    `SELECT MAX(elo) as peak_elo,
      COUNT(DISTINCT match_id) as matches,
      SUM(CASE WHEN side='winner' THEN 1 ELSE 0 END) as wins
     FROM pat_ranked_feed WHERE steam_id = ?`,
    playerArgs, filter
  );

  const playerRes = await db.execute({ sql: playerSql, args: playerArgs });
  const player = playerRes.rows[0];
  if (!player || Number(player.matches) < 1) {
    return NextResponse.json({ peakElo: { rank: null, total: 0, percentile: null }, winRate: { rank: null, total: 0, percentile: null } });
  }

  const playerPeak = Number(player.peak_elo);
  const playerWR = Number(player.wins) / Number(player.matches);
  const playerMatches = Number(player.matches);

  // Count how many players rank above this player (much faster than fetching all rows)
  // Peak ELO: count players with 5+ matches AND higher peak ELO
  const peakAboveArgs: (string | number)[] = [];
  const peakAboveSql = appendDateFilter(
    `SELECT COUNT(*) as cnt FROM (
      SELECT steam_id, MAX(elo) as peak_elo, COUNT(DISTINCT match_id) as matches
      FROM pat_ranked_feed WHERE 1=1`,
    peakAboveArgs, filter
  ) + ` GROUP BY steam_id HAVING matches >= 5 AND peak_elo > ${playerPeak})`;

  const peakTotalArgs: (string | number)[] = [];
  const peakTotalSql = appendDateFilter(
    `SELECT COUNT(*) as cnt FROM (
      SELECT steam_id, COUNT(DISTINCT match_id) as matches
      FROM pat_ranked_feed WHERE 1=1`,
    peakTotalArgs, filter
  ) + " GROUP BY steam_id HAVING matches >= 5)";

  // Win rate: count players with 50+ matches AND higher win rate
  const wrAboveArgs: (string | number)[] = [];
  const wrAboveSql = appendDateFilter(
    `SELECT COUNT(*) as cnt FROM (
      SELECT steam_id,
        COUNT(DISTINCT match_id) as matches,
        CAST(SUM(CASE WHEN side='winner' THEN 1 ELSE 0 END) AS REAL) / COUNT(DISTINCT match_id) as wr
      FROM pat_ranked_feed WHERE 1=1`,
    wrAboveArgs, filter
  ) + ` GROUP BY steam_id HAVING matches >= 50 AND wr > ${playerWR})`;

  const wrTotalArgs: (string | number)[] = [];
  const wrTotalSql = appendDateFilter(
    `SELECT COUNT(*) as cnt FROM (
      SELECT steam_id, COUNT(DISTINCT match_id) as matches
      FROM pat_ranked_feed WHERE 1=1`,
    wrTotalArgs, filter
  ) + " GROUP BY steam_id HAVING matches >= 50)";

  const [peakAboveRes, peakTotalRes, wrAboveRes, wrTotalRes] = await Promise.all([
    db.execute({ sql: peakAboveSql, args: peakAboveArgs }),
    db.execute({ sql: peakTotalSql, args: peakTotalArgs }),
    db.execute({ sql: wrAboveSql, args: wrAboveArgs }),
    db.execute({ sql: wrTotalSql, args: wrTotalArgs }),
  ]);

  const peakRank = playerMatches >= 5 ? Number(peakAboveRes.rows[0].cnt) + 1 : null;
  const peakTotal = Number(peakTotalRes.rows[0].cnt);
  const wrRank = playerMatches >= 50 ? Number(wrAboveRes.rows[0].cnt) + 1 : null;
  const wrTotal = Number(wrTotalRes.rows[0].cnt);

  return NextResponse.json({
    peakElo: {
      rank: peakRank,
      total: peakTotal,
      percentile: peakRank ? Math.round((1 - (peakRank - 1) / peakTotal) * 100) : null,
    },
    winRate: {
      rank: wrRank,
      total: wrTotal,
      percentile: wrRank ? Math.round((1 - (wrRank - 1) / wrTotal) * 100) : null,
    },
  });
}

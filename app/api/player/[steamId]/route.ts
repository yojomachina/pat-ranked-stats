import { db } from "@/lib/db";
import { getSeasonFilter, appendDateFilter } from "@/lib/seasons";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ steamId: string }> }) {
  const { steamId } = await params;
  const filter = getSeasonFilter(req.nextUrl.searchParams);

  const statsArgs: (string | number)[] = [steamId];
  const statsSql = appendDateFilter(
    `SELECT
      COUNT(DISTINCT match_id) as matches,
      SUM(CASE WHEN side = 'winner' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN side = 'loser' THEN 1 ELSE 0 END) as losses,
      SUM(kills) as total_kills,
      SUM(deaths) as total_deaths,
      ROUND(AVG(damage), 0) as avg_damage,
      MIN(date) as first_date,
      MAX(date) as last_date,
      MAX(elo) as peak_elo,
      player_name
    FROM pat_ranked_feed WHERE steam_id = ?`,
    statsArgs, filter
  );

  const firstEloArgs: (string | number)[] = [steamId];
  const firstEloSql = appendDateFilter(
    `SELECT elo FROM pat_ranked_feed WHERE steam_id = ?`,
    firstEloArgs, filter
  ) + " ORDER BY date ASC, time_utc ASC LIMIT 1";

  const lastEloArgs: (string | number)[] = [steamId];
  const lastEloSql = appendDateFilter(
    `SELECT elo FROM pat_ranked_feed WHERE steam_id = ?`,
    lastEloArgs, filter
  ) + " ORDER BY date DESC, time_utc DESC LIMIT 1";

  const [statsRes, profileRes, bansRes, firstEloRes, lastEloRes] = await Promise.all([
    db.execute({ sql: statsSql, args: statsArgs }),
    db.execute({ sql: "SELECT * FROM player_profiles WHERE steam_id = ?", args: [steamId] }),
    db.execute({ sql: "SELECT * FROM player_bans WHERE steam_id = ?", args: [steamId] }),
    db.execute({ sql: firstEloSql, args: firstEloArgs }),
    db.execute({ sql: lastEloSql, args: lastEloArgs }),
  ]);

  const stats = statsRes.rows[0];
  if (!stats || !stats.matches) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  const totalKills = Number(stats.total_kills) || 0;
  const totalDeaths = Number(stats.total_deaths) || 0;
  const firstElo = Number(firstEloRes.rows[0]?.elo) || 0;
  const lastElo = Number(lastEloRes.rows[0]?.elo) || 0;

  return NextResponse.json({
    steamId,
    playerName: stats.player_name,
    matches: Number(stats.matches),
    wins: Number(stats.wins),
    losses: Number(stats.losses),
    winRate: Number(stats.matches) > 0 ? (Number(stats.wins) / Number(stats.matches) * 100) : 0,
    kdr: totalDeaths > 0 ? totalKills / totalDeaths : totalKills,
    totalKills,
    totalDeaths,
    avgDamage: Number(stats.avg_damage) || 0,
    peakElo: Number(stats.peak_elo) || 0,
    currentElo: lastElo,
    netElo: lastElo - firstElo,
    firstDate: stats.first_date,
    lastDate: stats.last_date,
    profile: profileRes.rows[0] ?? null,
    bans: bansRes.rows[0] ?? null,
  });
}

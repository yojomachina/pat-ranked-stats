import { db } from "@/lib/db";
import { getSeasonFilter, appendDateFilter } from "@/lib/seasons";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ steamId: string }> }) {
  const { steamId } = await params;
  const filter = getSeasonFilter(req.nextUrl.searchParams);

  // Top 20 by win rate (50+ matches) — done in SQL with LIMIT
  const wrArgs: (string | number)[] = [];
  const wrSql = appendDateFilter(
    `SELECT steam_id, player_name,
      COUNT(DISTINCT match_id) as matches,
      SUM(CASE WHEN side='winner' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN side='loser' THEN 1 ELSE 0 END) as losses,
      SUM(kills) as total_kills, SUM(deaths) as total_deaths,
      ROUND(AVG(damage),0) as avg_damage, MAX(elo) as peak_elo
     FROM pat_ranked_feed WHERE 1=1`,
    wrArgs, filter
  ) + " GROUP BY steam_id HAVING matches >= 50 ORDER BY (CAST(wins AS REAL)/COUNT(DISTINCT match_id)) DESC LIMIT 25";

  // Top 20 by current ELO — get latest ELO per player, then join for stats
  const eloArgs: (string | number)[] = [];
  const eloSql = appendDateFilter(
    `SELECT steam_id, player_name,
      COUNT(DISTINCT match_id) as matches,
      SUM(CASE WHEN side='winner' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN side='loser' THEN 1 ELSE 0 END) as losses,
      SUM(kills) as total_kills, SUM(deaths) as total_deaths,
      ROUND(AVG(damage),0) as avg_damage, MAX(elo) as peak_elo
     FROM pat_ranked_feed WHERE 1=1`,
    eloArgs, filter
  ) + " GROUP BY steam_id HAVING matches >= 50 ORDER BY MAX(elo) DESC LIMIT 25";

  const [wrRes, eloRes] = await Promise.all([
    db.execute({ sql: wrSql, args: wrArgs }),
    db.execute({ sql: eloSql, args: eloArgs }),
  ]);

  // Get ban info for just these players
  const allIds = new Set<string>();
  wrRes.rows.forEach(r => allIds.add(String(r.steam_id)));
  eloRes.rows.forEach(r => allIds.add(String(r.steam_id)));
  
  const banMap: Record<string, { vac_banned: number; number_of_game_bans: number; days_since_last_ban: number }> = {};
  if (allIds.size > 0) {
    const placeholders = [...allIds].map(() => "?").join(",");
    const banRes = await db.execute({
      sql: `SELECT steam_id, vac_banned, number_of_game_bans, days_since_last_ban FROM player_bans WHERE steam_id IN (${placeholders})`,
      args: [...allIds],
    });
    banRes.rows.forEach(r => {
      banMap[String(r.steam_id)] = {
        vac_banned: Number(r.vac_banned) || 0,
        number_of_game_bans: Number(r.number_of_game_bans) || 0,
        days_since_last_ban: Number(r.days_since_last_ban) || 0,
      };
    });
  }

  const mapRow = (r: any) => {
    const kills = Number(r.total_kills), deaths = Number(r.total_deaths), matches = Number(r.matches), wins = Number(r.wins);
    return {
      steam_id: String(r.steam_id), player_name: String(r.player_name), matches, wins,
      losses: Number(r.losses), win_rate: matches > 0 ? wins / matches * 100 : 0,
      kdr: deaths > 0 ? kills / deaths : kills, peak_elo: Number(r.peak_elo),
      current_elo: Number(r.peak_elo), // approximate — peak within period
      avg_damage: Number(r.avg_damage) || 0,
      bans: banMap[String(r.steam_id)] || null,
    };
  };

  return NextResponse.json({
    byWinRate: wrRes.rows.map(mapRow).slice(0, 20),
    byElo: eloRes.rows.map(mapRow).slice(0, 20),
    currentPlayer: steamId,
  });
}

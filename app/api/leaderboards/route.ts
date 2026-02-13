import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") || "winrate";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = 50;
  const offset = (page - 1) * limit;

  let sql = "";
  if (type === "winrate") {
    sql = `SELECT f.steam_id, f.player_name,
            COUNT(DISTINCT f.match_id) as matches,
            SUM(CASE WHEN f.side = 'winner' THEN 1 ELSE 0 END) as wins,
            ROUND(SUM(CASE WHEN f.side = 'winner' THEN 1.0 ELSE 0.0 END) / COUNT(DISTINCT f.match_id) * 100, 1) as win_rate,
            SUM(f.kills) as total_kills, SUM(f.deaths) as total_deaths,
            pb.vac_banned, pb.number_of_game_bans
          FROM pat_ranked_feed f
          LEFT JOIN player_bans pb ON f.steam_id = pb.steam_id
          GROUP BY f.steam_id
          HAVING COUNT(DISTINCT f.match_id) >= 50
          ORDER BY win_rate DESC
          LIMIT ${limit} OFFSET ${offset}`;
  } else if (type === "elo") {
    sql = `SELECT f.steam_id, f.player_name,
            MAX(f.elo) as peak_elo,
            COUNT(DISTINCT f.match_id) as matches,
            pb.vac_banned, pb.number_of_game_bans
          FROM pat_ranked_feed f
          LEFT JOIN player_bans pb ON f.steam_id = pb.steam_id
          GROUP BY f.steam_id
          HAVING COUNT(DISTINCT f.match_id) >= 5
          ORDER BY peak_elo DESC
          LIMIT ${limit} OFFSET ${offset}`;
  } else if (type === "active") {
    sql = `SELECT f.steam_id, f.player_name,
            COUNT(DISTINCT f.match_id) as matches,
            SUM(CASE WHEN f.side = 'winner' THEN 1 ELSE 0 END) as wins,
            ROUND(SUM(CASE WHEN f.side = 'winner' THEN 1.0 ELSE 0.0 END) / COUNT(DISTINCT f.match_id) * 100, 1) as win_rate,
            pb.vac_banned, pb.number_of_game_bans
          FROM pat_ranked_feed f
          LEFT JOIN player_bans pb ON f.steam_id = pb.steam_id
          GROUP BY f.steam_id
          ORDER BY matches DESC
          LIMIT ${limit} OFFSET ${offset}`;
  } else if (type === "kdr") {
    sql = `SELECT f.steam_id, f.player_name,
            COUNT(DISTINCT f.match_id) as matches,
            SUM(f.kills) as total_kills, SUM(f.deaths) as total_deaths,
            ROUND(CAST(SUM(f.kills) AS FLOAT) / NULLIF(SUM(f.deaths), 0), 2) as kdr,
            pb.vac_banned, pb.number_of_game_bans
          FROM pat_ranked_feed f
          LEFT JOIN player_bans pb ON f.steam_id = pb.steam_id
          GROUP BY f.steam_id
          HAVING COUNT(DISTINCT f.match_id) >= 50
          ORDER BY kdr DESC
          LIMIT ${limit} OFFSET ${offset}`;
  }

  const result = await db.execute(sql);
  return NextResponse.json(result.rows);
}

import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  const result = await db.execute({
    sql: `SELECT DISTINCT f.steam_id, f.player_name,
            COUNT(DISTINCT f.match_id) as matches,
            pp.avatar_url
          FROM pat_ranked_feed f
          LEFT JOIN player_profiles pp ON f.steam_id = pp.steam_id
          WHERE f.player_name LIKE ? OR f.steam_id LIKE ?
          GROUP BY f.steam_id
          ORDER BY matches DESC
          LIMIT 20`,
    args: [`%${q}%`, `%${q}%`],
  });
  return NextResponse.json(result.rows);
}

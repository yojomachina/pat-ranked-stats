import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  // If it looks like a steam ID (all digits, 17 chars), search by exact ID
  if (/^\d{10,17}$/.test(q)) {
    const result = await db.execute({
      sql: `SELECT steam_id, player_name, COUNT(DISTINCT match_id) as matches, NULL as avatar_url
            FROM pat_ranked_feed
            WHERE steam_id = ?
            GROUP BY steam_id
            LIMIT 5`,
      args: [q],
    });
    return NextResponse.json(result.rows);
  }

  // Use player_profiles for fast name lookup if available, fall back to feed
  // Search profiles first (indexed by name), then enrich with match count
  const profileResult = await db.execute({
    sql: `SELECT pp.steam_id, pp.persona_name as player_name, pp.avatar_url
          FROM player_profiles pp
          WHERE pp.persona_name LIKE ?
          LIMIT 30`,
    args: [`%${q}%`],
  });

  if (profileResult.rows.length > 0) {
    // Get match counts for these players
    const ids = profileResult.rows.map(r => String(r.steam_id));
    const placeholders = ids.map(() => "?").join(",");
    const countResult = await db.execute({
      sql: `SELECT steam_id, COUNT(DISTINCT match_id) as matches
            FROM pat_ranked_feed
            WHERE steam_id IN (${placeholders})
            GROUP BY steam_id`,
      args: ids,
    });
    const countMap: Record<string, number> = {};
    countResult.rows.forEach(r => { countMap[String(r.steam_id)] = Number(r.matches); });

    const results = profileResult.rows
      .map(r => ({
        steam_id: r.steam_id,
        player_name: r.player_name,
        matches: countMap[String(r.steam_id)] || 0,
        avatar_url: r.avatar_url,
      }))
      .filter(r => r.matches > 0)
      .sort((a, b) => b.matches - a.matches)
      .slice(0, 20);

    return NextResponse.json(results);
  }

  // Fallback: search feed directly (slower, but works if profiles not synced)
  const result = await db.execute({
    sql: `SELECT steam_id, player_name, COUNT(DISTINCT match_id) as matches, NULL as avatar_url
          FROM pat_ranked_feed
          WHERE player_name LIKE ?
          GROUP BY steam_id
          ORDER BY matches DESC
          LIMIT 20`,
    args: [`%${q}%`],
  });
  return NextResponse.json(result.rows);
}

import { db } from "@/lib/db";
import { KNOWN_SEASONS } from "@/lib/seasons";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ steamId: string }> }) {
  const { steamId } = await params;

  const result = await db.execute({
    sql: `SELECT MIN(date) as min_date, MAX(date) as max_date FROM pat_ranked_feed WHERE steam_id = ?`,
    args: [steamId],
  });

  const row = result.rows[0];
  if (!row?.min_date) return NextResponse.json([]);

  const minDate = String(row.min_date);
  const maxDate = String(row.max_date);

  // Filter known seasons to those that overlap with this player's data
  const available = KNOWN_SEASONS.filter(
    (s) => s.to > minDate && s.from <= maxDate
  );

  return NextResponse.json(available);
}

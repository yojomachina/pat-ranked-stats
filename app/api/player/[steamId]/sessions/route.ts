import { db } from "@/lib/db";
import { getSeasonFilter, appendDateFilter } from "@/lib/seasons";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ steamId: string }> }) {
  const { steamId } = await params;
  const filter = getSeasonFilter(req.nextUrl.searchParams);

  const args: (string | number)[] = [steamId];
  const sql = appendDateFilter(
    `SELECT match_id, date, time_utc, elo, elo_change, side, kills, deaths, damage, created_at
     FROM pat_ranked_feed WHERE steam_id = ?`,
    args, filter
  ) + " ORDER BY date ASC, time_utc ASC";

  const result = await db.execute({ sql, args });
  const matches = result.rows;

  // Group into sessions: <30 min gap
  const sessions: {
    id: number; date: string; startTime: string; endTime: string;
    matches: number; wins: number; losses: number;
    eloStart: number; eloEnd: number; eloMin: number; eloMax: number; eloChange: number;
    durationMin: number; eloPerHour: number;
    totalKills: number; totalDeaths: number;
  }[] = [];

  let currentSession: typeof matches = [];
  let sessionIdx = 0;

  function parseDateTime(date: string, time: string): number {
    // date = "2026-01-25", time = "03:45"
    const [h, m] = (time || "00:00").split(":").map(Number);
    const d = new Date(date + "T00:00:00Z");
    return d.getTime() + h * 3600000 + m * 60000;
  }

  function flushSession() {
    if (currentSession.length === 0) return;
    sessionIdx++;
    const first = currentSession[0];
    const last = currentSession[currentSession.length - 1];
    const elos = currentSession.map(m => Number(m.elo));
    const wins = currentSession.filter(m => m.side === "winner").length;
    const losses = currentSession.filter(m => m.side === "loser").length;
    const eloStart = Number(first.elo) - Number(first.elo_change);
    const eloEnd = Number(last.elo);
    const startTs = parseDateTime(String(first.date), String(first.time_utc));
    const endTs = parseDateTime(String(last.date), String(last.time_utc));
    // Estimate ~10 min per match for the last match
    const durationMin = Math.max((endTs - startTs) / 60000 + 10, 10);
    const eloChange = eloEnd - eloStart;
    const eloPerHour = durationMin > 0 ? Math.round(eloChange / (durationMin / 60)) : 0;

    sessions.push({
      id: sessionIdx,
      date: String(first.date),
      startTime: String(first.time_utc || "??:??"),
      endTime: String(last.time_utc || "??:??"),
      matches: currentSession.length,
      wins, losses,
      eloStart, eloEnd,
      eloMin: Math.min(...elos, eloStart),
      eloMax: Math.max(...elos),
      eloChange,
      durationMin: Math.round(durationMin),
      eloPerHour,
      totalKills: currentSession.reduce((s, m) => s + Number(m.kills), 0),
      totalDeaths: currentSession.reduce((s, m) => s + Number(m.deaths), 0),
    });
    currentSession = [];
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (currentSession.length === 0) {
      currentSession.push(m);
      continue;
    }
    const prev = currentSession[currentSession.length - 1];
    const prevTs = parseDateTime(String(prev.date), String(prev.time_utc));
    const currTs = parseDateTime(String(m.date), String(m.time_utc));
    if (currTs - prevTs > 30 * 60000) {
      flushSession();
    }
    currentSession.push(m);
  }
  flushSession();

  return NextResponse.json(sessions);
}

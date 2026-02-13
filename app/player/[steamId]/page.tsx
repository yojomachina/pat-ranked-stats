"use client";
import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell,
} from "recharts";

// Types
interface PlayerData {
  steamId: string; playerName: string; matches: number; wins: number; losses: number;
  winRate: number; kdr: number; totalKills: number; totalDeaths: number; avgDamage: number;
  peakElo: number; currentElo: number; netElo: number; firstDate: string; lastDate: string;
  profile: { avatar_url?: string; time_created?: number; persona_name?: string; country?: string } | null;
  bans: { vac_banned?: number; number_of_vac_bans?: number; number_of_game_bans?: number; days_since_last_ban?: number } | null;
}

interface EloPoint { date: string; time_utc: string; elo: number; side: string; match_id: string; elo_change: number }
interface DailyRow { date: string; matches: number; wins: number; losses: number; total_kills: number; total_deaths: number; avg_damage: number; min_elo: number; max_elo: number; elo_change: number }
interface Opponent { steam_id: string; player_name: string; times_faced: number; wins: number; losses: number; opp_peak_elo: number; opp_kills: number; opp_deaths: number; bans?: BanInfo | null }
interface Season { id: string; label: string; from: string; to: string }
interface TimeBlock { time_block: string; matches: number; wins: number; losses: number; total_kills: number; total_deaths: number }
interface DamageRange { damage_range: string; count: number }
interface BanInfo { vac: number; vac_count: number; game: number; days: number }
interface DisconnectDetail { match_id: string; date: string; opp_name: string; opp_steam_id: string; opp_elo: number; score: string; type: string; bans: BanInfo | null }
interface DisconnectData { byPlayer: number; againstPlayer: number; byPlayerDetails: DisconnectDetail[]; againstPlayerDetails: DisconnectDetail[] }
interface SessionData {
  id: number; date: string; startTime: string; endTime: string;
  matches: number; wins: number; losses: number;
  eloStart: number; eloEnd: number; eloMin: number; eloMax: number; eloChange: number;
  durationMin: number; eloPerHour: number; totalKills: number; totalDeaths: number;
}
interface RankingData { peakElo: { rank: number | null; total: number; percentile: number | null }; winRate: { rank: number | null; total: number; percentile: number | null } }
interface LeaderboardPlayer {
  steam_id: string; player_name: string; matches: number; wins: number; losses: number;
  win_rate: number; kdr: number; peak_elo: number; current_elo: number; avg_damage: number;
  bans: { vac_banned: number; number_of_vac_bans: number; number_of_game_bans: number; days_since_last_ban: number } | null;
}
interface LeaderboardData { byWinRate: LeaderboardPlayer[]; byElo: LeaderboardPlayer[]; currentPlayer: string }

function fmt(n: number): string { return n.toLocaleString(); }

function BanBadge({ bans }: { bans?: BanInfo | { vac_banned?: number; number_of_vac_bans?: number; number_of_game_bans?: number; days_since_last_ban?: number } | null }) {
  if (!bans) return null;
  const vac = ('vac' in bans) ? bans.vac : (bans.vac_banned || 0);
  const game = ('game' in bans) ? bans.game : (bans.number_of_game_bans || 0);
  const days = ('days' in bans) ? bans.days : (bans.days_since_last_ban || 0);
  const age = days > 365 ? `${(days / 365).toFixed(1)}y` : days > 30 ? `${Math.round(days / 30)}mo` : `${days}d`;
  return (
    <>
      {vac > 0 && <span className="text-[8px] font-bold bg-[#f87171] text-black px-1 py-0.5 rounded ml-1">VAC {age}</span>}
      {game > 0 && <span className="text-[8px] font-bold bg-[#fbbf24] text-black px-1 py-0.5 rounded ml-1">GAME BAN {age}</span>}
    </>
  );
}

// Custom dot for ELO chart
function EloDot(props: { cx?: number; cy?: number; payload?: EloPoint }) {
  const { cx, cy, payload } = props;
  if (!cx || !cy || !payload) return null;
  return <circle cx={cx} cy={cy} r={3} fill={payload.side === "winner" ? "#4ade80" : "#f87171"} />;
}

function EloTooltip({ active, payload }: { active?: boolean; payload?: { payload: EloPoint }[] }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#12121a] border border-[#1e1e2e] rounded-lg p-3 text-xs">
      <div className="text-white font-bold">{fmt(d.elo)} ELO</div>
      <div className="text-[#888]">{d.date} {d.time_utc}</div>
      <div className={d.side === "winner" ? "text-green-400" : "text-red-400"}>
        {d.side === "winner" ? "Win" : "Loss"} ({d.elo_change > 0 ? "+" : ""}{d.elo_change})
      </div>
    </div>
  );
}

export default function PlayerPage({ params }: { params: Promise<{ steamId: string }> }) {
  const { steamId } = use(params);
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [eloHistory, setEloHistory] = useState<EloPoint[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [timeOfDay, setTimeOfDay] = useState<TimeBlock[]>([]);
  const [damageDist, setDamageDist] = useState<DamageRange[]>([]);
  const [disconnects, setDisconnects] = useState<DisconnectData>({ byPlayer: 0, againstPlayer: 0, byPlayerDetails: [], againstPlayerDetails: [] });
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [rankings, setRankings] = useState<RankingData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [matchHistory, setMatchHistory] = useState<any[]>([]);
  const [matchPage, setMatchPage] = useState(1);
  const [matchTotalPages, setMatchTotalPages] = useState(0);
  const [matchTotal, setMatchTotal] = useState(0);
  const [matchLoading, setMatchLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const seasonParam = selectedSeason === "all" ? "" : `?season=${selectedSeason}`;

  const fetchData = useCallback(() => {
    setLoading(true);
    const q = seasonParam;
    // Fast endpoints — load these first to render the page quickly
    Promise.all([
      fetch(`/api/player/${steamId}${q}`).then(r => r.json()),
      fetch(`/api/player/${steamId}/elo-history${q}`).then(r => r.json()),
      fetch(`/api/player/${steamId}/daily${q}`).then(r => r.json()),
      fetch(`/api/player/${steamId}/opponents${q}`).then(r => r.json()),
      fetch(`/api/player/${steamId}/time-of-day${q}`).then(r => r.json()),
      fetch(`/api/player/${steamId}/damage-dist${q}`).then(r => r.json()),
      fetch(`/api/player/${steamId}/disconnects${q}`).then(r => r.json()),
      fetch(`/api/player/${steamId}/sessions${q}`).then(r => r.json()),
    ]).then(([p, e, d, o, t, dm, dc, sess]) => {
      setPlayer(p.error ? null : p);
      setEloHistory(Array.isArray(e) ? e : []);
      setDaily(Array.isArray(d) ? d : []);
      setOpponents(Array.isArray(o) ? o : []);
      setTimeOfDay(Array.isArray(t) ? t : []);
      setDamageDist(Array.isArray(dm) ? dm : []);
      setDisconnects(dc?.byPlayerDetails ? dc : { byPlayer: 0, againstPlayer: 0, byPlayerDetails: [], againstPlayerDetails: [] });
      setSessions(Array.isArray(sess) ? sess : []);
      setLoading(false);
    }).catch(() => setLoading(false));
    // Slow endpoints — load lazily after page renders
    fetch(`/api/player/${steamId}/rankings${q}`).then(r => r.json()).then(rank => {
      setRankings(rank?.peakElo ? rank : null);
    }).catch(() => {});
    fetch(`/api/player/${steamId}/leaderboard${q}`).then(r => r.json()).then(lb => {
      setLeaderboard(lb?.byWinRate ? lb : null);
    }).catch(() => {});
  }, [steamId, seasonParam]);

  const fetchMatches = useCallback((page: number) => {
    setMatchLoading(true);
    fetch(`/api/player/${steamId}/matches?page=${page}${seasonParam ? '&' + seasonParam.slice(1) : ''}`)
      .then(r => r.json())
      .then(d => {
        setMatchHistory(d.matches || []);
        setMatchTotalPages(d.totalPages || 0);
        setMatchTotal(d.total || 0);
        setMatchPage(d.page || 1);
        setMatchLoading(false);
      }).catch(() => setMatchLoading(false));
  }, [steamId, seasonParam]);

  useEffect(() => {
    fetch(`/api/player/${steamId}/seasons`).then(r => r.json()).then(s => {
      if (Array.isArray(s)) setSeasons(s);
    });
  }, [steamId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchMatches(1); }, [fetchMatches]);

  if (loading) return <div className="text-center py-20 text-[#888]">Loading...</div>;
  if (!player) return <div className="text-center py-20 text-[#888]">Player not found</div>;

  const hasVac = player.bans && player.bans.vac_banned;
  const hasGameBan = player.bans && (player.bans.number_of_game_bans ?? 0) > 0;

  const notable = opponents.filter(o => Number(o.times_faced) >= 2).sort((a, b) => Number(b.times_faced) - Number(a.times_faced));
  const nemesis = [...opponents].filter(o => Number(o.losses) > 0).sort((a, b) => Number(b.losses) - Number(a.losses))[0];
  const prey = [...opponents].filter(o => Number(o.wins) > 0).sort((a, b) => Number(b.wins) - Number(a.wins))[0];

  const freqMap: Record<string, number> = { "1x": 0, "2x": 0, "3x": 0, "4+": 0 };
  opponents.forEach(o => {
    const f = Number(o.times_faced);
    if (f === 1) freqMap["1x"]++;
    else if (f === 2) freqMap["2x"]++;
    else if (f === 3) freqMap["3x"]++;
    else freqMap["4+"]++;
  });
  const freqData = Object.entries(freqMap).map(([k, v]) => ({ label: k, count: v }));

  const beaten = opponents.filter(o => Number(o.wins) > 0)
    .sort((a, b) => Number(b.opp_peak_elo) - Number(a.opp_peak_elo))
    .slice(0, 5);

  const dailyAsc = [...daily].reverse();
  const dailyTrends = dailyAsc.map(d => ({
    date: d.date,
    winRate: Number(d.matches) > 0 ? Math.round(Number(d.wins) / Number(d.matches) * 100) : 0,
    kdr: Number(d.total_deaths) > 0 ? Math.round(Number(d.total_kills) / Number(d.total_deaths) * 100) / 100 : 0,
  }));

  const eloChartData = eloHistory.map((e, i) => ({ ...e, idx: i + 1, elo: Number(e.elo) }));

  // Season note
  const seasonNote = (() => {
    if (eloHistory.length === 0) return null;
    const firstElo = Number(eloHistory[0].elo) - Number(eloHistory[0].elo_change);
    const lastElo = Number(eloHistory[eloHistory.length - 1].elo);
    const peakElo = player.peakElo;
    const swing = lastElo - firstElo;
    const perfectDays = daily.filter(d => Number(d.losses) === 0 && Number(d.matches) > 0).length;
    const totalDays = daily.length;
    const currentSeason = seasons.find(s => s.id === selectedSeason);
    const seasonLabel = currentSeason?.label || "all tracked seasons";

    let note = `${fmt(player.matches)} matches across ${totalDays} days`;
    if (currentSeason) note += ` in ${seasonLabel}`;
    note += `. Started at ${fmt(firstElo)} ELO`;
    if (swing >= 0) note += ` and climbed to ${fmt(lastElo)}`;
    else note += ` and dropped to ${fmt(lastElo)}`;
    note += ` — a ${fmt(Math.abs(swing))} ELO ${swing >= 0 ? "gain" : "loss"}.`;
    note += ` Peak: ${fmt(peakElo)}.`;
    if (perfectDays > 0) note += ` ${perfectDays} perfect day${perfectDays > 1 ? "s" : ""} (no losses).`;
    return note;
  })();

  // Session chart data for ELO/hr
  const sessionChartData = sessions.map(s => ({
    label: `S${s.id}`,
    eloPerHour: s.eloPerHour,
    matches: s.matches,
  }));
  const bestSession = sessions.reduce<SessionData | null>((best, s) => (!best || s.eloPerHour > best.eloPerHour) ? s : best, null);
  const overallEloPerHour = sessions.length > 0
    ? Math.round(sessions.reduce((s, ss) => s + ss.eloChange, 0) / Math.max(sessions.reduce((s, ss) => s + ss.durationMin, 0) / 60, 1))
    : 0;

  return (
    <div className="space-y-6">
      {/* Season Filter */}
      {seasons.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-[#888] text-sm">Season:</label>
          <select
            value={selectedSeason}
            onChange={e => setSelectedSeason(e.target.value)}
            className="bg-[#12121a] border border-[#1e1e2e] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#ff6b35]"
          >
            <option value="all">All Time</option>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      )}

      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between border-b-2 border-[#1e1e2e] pb-5">
        <div className="flex items-center gap-4">
          {player.profile?.avatar_url && (
            <img src={player.profile.avatar_url} alt="" className="w-16 h-16 rounded-full border-2 border-[#1e1e2e]" />
          )}
          <div>
            <h1 className="text-3xl font-black flex items-center gap-2">
              <span className="text-[#ff6b35]">{player.playerName}</span>
              <span className="text-white">— Performance Report</span>
              {hasVac && (() => {
                const d = player.bans!.days_since_last_ban || 0;
                const ageStr = d > 365 ? `${(d / 365).toFixed(1)}y` : d > 30 ? `${Math.round(d / 30)}mo` : `${d}d`;
                return (
                  <span className="text-[9px] font-bold bg-[#f87171] text-black px-1.5 py-0.5 rounded ml-1">
                    VAC{player.bans!.number_of_vac_bans! > 1 ? ` ×${player.bans!.number_of_vac_bans}` : ""} {ageStr}
                  </span>
                );
              })()}
              {hasGameBan && (() => {
                const d = player.bans!.days_since_last_ban || 0;
                const ageStr = d > 365 ? `${(d / 365).toFixed(1)}y` : d > 30 ? `${Math.round(d / 30)}mo` : `${d}d`;
                return (
                  <span className="text-[9px] font-bold bg-[#fbbf24] text-black px-1.5 py-0.5 rounded ml-1">
                    {player.bans!.number_of_game_bans} GAME BAN {ageStr}
                  </span>
                );
              })()}
            </h1>
            <div className="text-[#888] text-sm mt-1">
              PAT 1v1 Ranked • {player.firstDate} – {player.lastDate} • {fmt(player.matches)} Matches
            </div>
            <div className="text-[#555] text-xs font-mono">
              Steam: <a href={`https://steamcommunity.com/profiles/${steamId}`} target="_blank" rel="noopener noreferrer" className="text-[#ff6b35] hover:underline">{steamId}</a>
              {player.profile?.time_created ? (() => {
                const created = new Date(Number(player.profile.time_created) * 1000);
                const days = (Date.now() - created.getTime()) / (24 * 60 * 60 * 1000);
                const years = days / 365.25;
                const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                const isNew = days < 30;
                return <span className={`ml-3 ${isNew ? "text-[#f87171] font-bold" : "text-[#888]"}`}>• Account: {monthNames[created.getMonth()]} {created.getFullYear()} ({years.toFixed(1)}y){isNew ? " ⚠️ NEW" : ""}</span>;
              })() : null}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[#888] text-xs uppercase tracking-widest">Peak ELO</div>
          <div className="text-5xl font-black text-[#ff6b35]">{fmt(player.peakElo)}</div>
        </div>
      </div>

      {/* ===== SEASON NOTE ===== */}
      {seasonNote && (
        <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4">
          <div className="text-sm text-[#ccc] leading-relaxed">📝 {seasonNote}</div>
        </div>
      )}

      {/* ===== STATS ROW ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Total Matches", value: fmt(player.matches) },
          { label: "Win-Loss", value: `${player.wins}-${player.losses}`, color: "text-green-400" },
          { label: "Win Rate", value: `${player.winRate.toFixed(1)}%`, color: "text-[#ff6b35]" },
          { label: "Overall KDR", value: player.kdr.toFixed(2) },
          { label: "Avg Damage", value: fmt(player.avgDamage) },
          { label: "Net ELO", value: `${player.netElo > 0 ? "+" : ""}${fmt(player.netElo)}`, color: player.netElo >= 0 ? "text-green-400" : "text-red-400" },
        ].map(s => (
          <div key={s.label} className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4 text-center">
            <div className={`text-2xl font-black ${s.color || "text-white"}`}>{s.value}</div>
            <div className="text-[11px] text-[#666] uppercase tracking-wider mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ===== PERCENTILE RANKING ===== */}
      {rankings && (rankings.peakElo.rank || rankings.winRate.rank) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rankings.peakElo.rank && (
            <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#888] mb-2">🏅 Peak ELO Rank (5+ matches)</h2>
              <div className="text-3xl font-black text-[#ff6b35]">#{rankings.peakElo.rank} <span className="text-lg text-[#888]">/ {rankings.peakElo.total}</span></div>
              <div className="text-sm text-[#ccc] mt-1">Top {rankings.peakElo.percentile}%</div>
              <div className="mt-2 h-3 bg-[#1a1a2e] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#ff6b35] to-[#ff8f5e] rounded-full" style={{ width: `${rankings.peakElo.percentile}%` }} />
              </div>
            </div>
          )}
          {rankings.winRate.rank && (
            <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#888] mb-2">🏅 Win Rate Rank (50+ matches)</h2>
              <div className="text-3xl font-black text-[#ff6b35]">#{rankings.winRate.rank} <span className="text-lg text-[#888]">/ {rankings.winRate.total}</span></div>
              <div className="text-sm text-[#ccc] mt-1">Top {rankings.winRate.percentile}%</div>
              <div className="mt-2 h-3 bg-[#1a1a2e] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#4ade80] to-[#86efac] rounded-full" style={{ width: `${rankings.winRate.percentile}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== ELO PROGRESSION ===== */}
      {eloChartData.length > 1 && (
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider mb-3">📈 ELO Progression ({fmt(eloChartData.length)} Matches)</h2>
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={eloChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" />
                <XAxis dataKey="idx" tick={{ fill: "#555", fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: "#555", fontSize: 10 }} tickLine={false} domain={["auto", "auto"]} />
                <Tooltip content={<EloTooltip />} />
                <Line type="monotone" dataKey="elo" stroke="#ff6b35" strokeWidth={2} dot={<EloDot />} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ===== DAILY TRENDS ===== */}
      {dailyTrends.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h2 className="text-base font-bold uppercase tracking-wider mb-3">📊 Win Rate Trend</h2>
            <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={dailyTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" />
                  <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 9 }} tickLine={false} />
                  <YAxis tick={{ fill: "#555", fontSize: 10 }} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: "#12121a", border: "1px solid #1e1e2e", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="winRate" stroke="#4ade80" strokeWidth={2} dot={{ r: 3, fill: "#4ade80" }} name="Win Rate %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <h2 className="text-base font-bold uppercase tracking-wider mb-3">📊 KDR Trend</h2>
            <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={dailyTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" />
                  <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 9 }} tickLine={false} />
                  <YAxis tick={{ fill: "#555", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#12121a", border: "1px solid #1e1e2e", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="kdr" stroke="#ff6b35" strokeWidth={2} dot={{ r: 3, fill: "#ff6b35" }} name="KDR" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ===== ELO PER HOUR ===== */}
      {sessions.length > 0 && (
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider mb-3">⚡ ELO Per Hour</h2>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
            <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4 text-center">
              <div className={`text-2xl font-black ${overallEloPerHour >= 0 ? "text-green-400" : "text-red-400"}`}>
                {overallEloPerHour > 0 ? "+" : ""}{overallEloPerHour}
              </div>
              <div className="text-[11px] text-[#666] uppercase tracking-wider mt-1">Overall ELO/hr</div>
            </div>
            <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-white">{sessions.length}</div>
              <div className="text-[11px] text-[#666] uppercase tracking-wider mt-1">Sessions</div>
            </div>
            {bestSession && (
              <div className="bg-[#12121a] border border-[#ff6b35]/30 rounded-xl p-4 text-center col-span-2">
                <div className="text-2xl font-black text-[#ff6b35]">⭐ S{bestSession.id}: +{bestSession.eloPerHour} ELO/hr</div>
                <div className="text-[11px] text-[#666] uppercase tracking-wider mt-1">
                  Best Session — {bestSession.date} • {bestSession.matches} matches • {bestSession.wins}-{bestSession.losses}
                </div>
              </div>
            )}
          </div>
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sessionChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" />
                <XAxis dataKey="label" tick={{ fill: "#888", fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: "#888", fontSize: 10 }} tickLine={false} />
                <Tooltip contentStyle={{ background: "#12121a", border: "1px solid #1e1e2e", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="eloPerHour" name="ELO/hr" radius={[4, 4, 0, 0]}>
                  {sessionChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.eloPerHour >= 0 ? "#4ade80" : "#f87171"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ===== SESSION BREAKDOWN ===== */}
      {sessions.length > 0 && (
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider mb-3">🎮 Session Breakdown</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {sessions.map(s => {
              const isLegendary = s.eloPerHour > 200 && s.matches >= 3;
              const isBad = s.eloPerHour < -200 && s.matches >= 3;
              const borderColor = isLegendary ? "border-[#ff6b35]" : isBad ? "border-red-500" : "border-[#1e1e2e]";
              const kdr = s.totalDeaths > 0 ? (s.totalKills / s.totalDeaths).toFixed(2) : "∞";
              return (
                <div key={s.id} className={`bg-[#12121a] border ${borderColor} rounded-xl p-4`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[#ff6b35] font-bold text-sm">S{s.id} {isLegendary ? "🔥" : isBad ? "💀" : ""}</span>
                    <span className={`text-lg font-black ${s.eloChange >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {s.eloChange > 0 ? "+" : ""}{s.eloChange}
                    </span>
                  </div>
                  <div className="text-[#888] text-xs mb-2">{s.date} • {s.startTime}–{s.endTime} • {s.durationMin}min</div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-white font-bold text-sm">{s.matches}</div>
                      <div className="text-[#666] text-[9px] uppercase">Matches</div>
                    </div>
                    <div>
                      <div className="text-white font-bold text-sm">{s.wins}-{s.losses}</div>
                      <div className="text-[#666] text-[9px] uppercase">W-L</div>
                    </div>
                    <div>
                      <div className={`font-bold text-sm ${s.eloPerHour >= 0 ? "text-green-400" : "text-red-400"}`}>{s.eloPerHour > 0 ? "+" : ""}{s.eloPerHour}</div>
                      <div className="text-[#666] text-[9px] uppercase">ELO/hr</div>
                    </div>
                  </div>
                  <div className="text-[#555] text-[10px] mt-2">ELO: {fmt(s.eloMin)} – {fmt(s.eloMax)} • KDR: {kdr}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== DAY-BY-DAY BREAKDOWN ===== */}
      {daily.length > 0 && (
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider mb-3">📅 Day-by-Day Breakdown</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {daily.map((d) => {
              const wr = Number(d.matches) > 0 ? Number(d.wins) / Number(d.matches) * 100 : 0;
              const kdr = Number(d.total_deaths) > 0 ? (Number(d.total_kills) / Number(d.total_deaths)).toFixed(2) : "∞";
              const eloChange = Number(d.elo_change);
              return (
                <div key={d.date} className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-white font-bold">{d.date}</span>
                    <span className={`text-lg font-black ${eloChange >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {eloChange > 0 ? "+" : ""}{eloChange}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { l: "Matches", v: d.matches },
                      { l: "W-L", v: `${d.wins}-${d.losses}` },
                      { l: "KDR", v: kdr },
                      { l: "Avg DMG", v: d.avg_damage },
                    ].map(s => (
                      <div key={s.l} className="text-center">
                        <div className="text-white font-bold text-sm">{s.v}</div>
                        <div className="text-[#666] text-[9px] uppercase">{s.l}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[#666] text-[10px] mb-1">ELO: {d.min_elo} – {d.max_elo}</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-4 bg-[#1a1a2e] rounded overflow-hidden flex">
                      <div className="bg-gradient-to-r from-green-400 to-green-500 h-full" style={{ width: `${wr}%` }} />
                      <div className="bg-gradient-to-r from-red-400 to-red-500 h-full" style={{ width: `${100 - wr}%` }} />
                    </div>
                    <span className="text-white text-xs font-semibold w-10 text-right">{wr.toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== NOTABLE OPPONENTS ===== */}
      {notable.length > 0 && (
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider mb-3">⚔️ Notable Opponents (Faced 2+ Times)</h2>
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[#1e1e2e] text-[#555] text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-2.5">Opponent</th>
                <th className="text-right px-4 py-2.5">Faced</th>
                <th className="text-right px-4 py-2.5">Record</th>
                <th className="text-right px-4 py-2.5">WR%</th>
                <th className="text-right px-4 py-2.5">Their Peak ELO</th>
                <th className="text-right px-4 py-2.5">Their KDR</th>
              </tr></thead>
              <tbody>
                {notable.slice(0, 20).map((o) => {
                  const wr = Number(o.times_faced) > 0 ? (Number(o.wins) / Number(o.times_faced) * 100) : 0;
                  const tag = Number(o.wins) > Number(o.losses) ? "text-green-400" : Number(o.wins) < Number(o.losses) ? "text-red-400" : "text-yellow-400";
                  const oppKdr = Number(o.opp_deaths) > 0 ? (Number(o.opp_kills) / Number(o.opp_deaths)).toFixed(2) : "-";
                  return (
                    <tr key={o.steam_id} className="border-b border-[#111] hover:bg-[#1a1a2e]">
                      <td className="px-4 py-2">
                        <Link href={`/player/${o.steam_id}`} className="hover:text-[#ff6b35] transition">{o.player_name}</Link>
                        <BanBadge bans={o.bans} />
                      </td>
                      <td className="px-4 py-2 text-right">{o.times_faced}</td>
                      <td className={`px-4 py-2 text-right font-bold ${tag}`}>{o.wins}-{o.losses}</td>
                      <td className="px-4 py-2 text-right">{wr.toFixed(0)}%</td>
                      <td className="px-4 py-2 text-right text-[#888]">{fmt(Number(o.opp_peak_elo))}</td>
                      <td className="px-4 py-2 text-right text-[#888]">{oppKdr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== NEMESIS & PREY ===== */}
      {(nemesis || prey) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {nemesis && (
            <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
              <h2 className="text-base font-bold uppercase tracking-wider mb-3">😤 Nemesis</h2>
              <div className="text-red-400 text-lg font-bold">
                <Link href={`/player/${nemesis.steam_id}`} className="hover:underline">{nemesis.player_name}</Link>
                <BanBadge bans={nemesis.bans} />
              </div>
              <div className="text-[#888] text-sm mt-1">
                {nemesis.wins}-{nemesis.losses} record ({Number(nemesis.times_faced)} games)
              </div>
              <div className="text-[#666] text-xs mt-1">Lost {nemesis.losses} times to this opponent</div>
            </div>
          )}
          {prey && (
            <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
              <h2 className="text-base font-bold uppercase tracking-wider mb-3">😈 Prey</h2>
              <div className="text-green-400 text-lg font-bold">
                <Link href={`/player/${prey.steam_id}`} className="hover:underline">{prey.player_name}</Link>
                <BanBadge bans={prey.bans} />
              </div>
              <div className="text-[#888] text-sm mt-1">
                {prey.wins}-{prey.losses} record ({Number(prey.times_faced)} games)
              </div>
              <div className="text-[#666] text-xs mt-1">Dominated {prey.wins} times</div>
            </div>
          )}
        </div>
      )}

      {/* ===== REPEAT OPPONENT FREQUENCY ===== */}
      {opponents.length > 0 && (
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider mb-3">🔄 Repeat Opponent Frequency</h2>
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
            {freqData.map(f => (
              <div key={f.label} className="flex items-center gap-3 mb-2">
                <span className="text-[#888] text-sm w-8">{f.label}</span>
                <div className="flex-1 h-5 bg-[#1a1a2e] rounded overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#ff6b35] to-[#ff8f5e] rounded"
                    style={{ width: `${opponents.length > 0 ? (f.count / opponents.length * 100) : 0}%` }}
                  />
                </div>
                <span className="text-white text-sm font-semibold w-10 text-right">{f.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== HIGHEST ELO OPPONENTS BEATEN ===== */}
      {beaten.length > 0 && (
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider mb-3">🏆 Highest ELO Opponents Beaten</h2>
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
            {beaten.map((o, i) => (
              <div key={o.steam_id} className="flex items-center justify-between py-2 border-b border-[#111] last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-[#ff6b35] font-bold w-6">#{i + 1}</span>
                  <Link href={`/player/${o.steam_id}`} className="text-white hover:text-[#ff6b35] transition">{o.player_name}</Link>
                  <BanBadge bans={o.bans} />
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-green-400 font-bold text-sm">{o.wins}-{o.losses}</span>
                  <span className="text-[#888] text-sm">{fmt(Number(o.opp_peak_elo))} ELO</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== PERFORMANCE BY TIME OF DAY ===== */}
      {timeOfDay.length > 0 && (
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider mb-3">🕐 Performance by Time of Day</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {timeOfDay.map(t => {
              const wr = Number(t.matches) > 0 ? (Number(t.wins) / Number(t.matches) * 100) : 0;
              const kdr = Number(t.total_deaths) > 0 ? (Number(t.total_kills) / Number(t.total_deaths)).toFixed(2) : "∞";
              return (
                <div key={t.time_block} className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4 text-center">
                  <div className="text-[#888] text-xs uppercase mb-2">{t.time_block}</div>
                  <div className="text-white text-xl font-bold">{Number(t.matches)} matches</div>
                  <div className={`text-sm font-semibold mt-1 ${wr >= 50 ? "text-green-400" : "text-red-400"}`}>{wr.toFixed(1)}% WR</div>
                  <div className="text-[#888] text-xs mt-1">KDR: {kdr}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== DAMAGE DISTRIBUTION ===== */}
      {damageDist.length > 0 && (
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider mb-3">💥 Damage Distribution</h2>
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={damageDist}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" />
                <XAxis dataKey="damage_range" tick={{ fill: "#888", fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: "#888", fontSize: 10 }} tickLine={false} />
                <Tooltip contentStyle={{ background: "#12121a", border: "1px solid #1e1e2e", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="#ff6b35" radius={[4, 4, 0, 0]} name="Matches" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ===== DISCONNECTS / RAGEQUITS ===== */}
      {(disconnects.byPlayer > 0 || disconnects.againstPlayer > 0) && (
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider mb-3">🚪 Disconnects / Ragequits</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5 text-center">
              <div className="text-red-400 text-3xl font-black">{disconnects.byPlayer}</div>
              <div className="text-[#888] text-xs uppercase mt-1">You Disconnected</div>
            </div>
            <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5 text-center">
              <div className="text-green-400 text-3xl font-black">{disconnects.againstPlayer}</div>
              <div className="text-[#888] text-xs uppercase mt-1">Opponents Rage-Quit</div>
            </div>
          </div>
          {disconnects.byPlayerDetails.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-bold text-[#888] uppercase mb-2">You Disconnected</h3>
              <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-[#1e1e2e] text-[#555] text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-2">Opponent</th>
                    <th className="text-right px-4 py-2">Score</th>
                    <th className="text-right px-4 py-2">Their ELO</th>
                    <th className="text-right px-4 py-2">Type</th>
                    <th className="text-right px-4 py-2">Date</th>
                  </tr></thead>
                  <tbody>
                    {disconnects.byPlayerDetails.map((d, i) => (
                      <tr key={i} className="border-b border-[#111] hover:bg-[#1a1a2e]">
                        <td className="px-4 py-2">
                          <Link href={`/player/${d.opp_steam_id}`} className="hover:text-[#ff6b35]">{d.opp_name}</Link>
                          <BanBadge bans={d.bans} />
                        </td>
                        <td className="px-4 py-2 text-right">{d.score}</td>
                        <td className="px-4 py-2 text-right text-[#888]">{fmt(d.opp_elo)}</td>
                        <td className="px-4 py-2 text-right text-red-400 text-xs">{d.type}</td>
                        <td className="px-4 py-2 text-right text-[#666]">{d.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {disconnects.againstPlayerDetails.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-[#888] uppercase mb-2">Opponents Rage-Quit</h3>
              <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-[#1e1e2e] text-[#555] text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-2">Opponent</th>
                    <th className="text-right px-4 py-2">Score</th>
                    <th className="text-right px-4 py-2">Their ELO</th>
                    <th className="text-right px-4 py-2">Type</th>
                    <th className="text-right px-4 py-2">Date</th>
                  </tr></thead>
                  <tbody>
                    {disconnects.againstPlayerDetails.map((d, i) => (
                      <tr key={i} className="border-b border-[#111] hover:bg-[#1a1a2e]">
                        <td className="px-4 py-2">
                          <Link href={`/player/${d.opp_steam_id}`} className="hover:text-[#ff6b35]">{d.opp_name}</Link>
                          <BanBadge bans={d.bans} />
                        </td>
                        <td className="px-4 py-2 text-right">{d.score}</td>
                        <td className="px-4 py-2 text-right text-[#888]">{fmt(d.opp_elo)}</td>
                        <td className="px-4 py-2 text-right text-green-400 text-xs">{d.type}</td>
                        <td className="px-4 py-2 text-right text-[#666]">{d.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== TOP 20 WIN RATE ===== */}
      {leaderboard && leaderboard.byWinRate.length > 0 && (
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider mb-3">🥇 Top 20 by Win Rate (50+ Matches)</h2>
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[#1e1e2e] text-[#555] text-xs uppercase tracking-wider">
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Player</th>
                <th className="text-right px-3 py-2">Matches</th>
                <th className="text-right px-3 py-2">W-L</th>
                <th className="text-right px-3 py-2">Win Rate</th>
                <th className="text-right px-3 py-2">KDR</th>
                <th className="text-right px-3 py-2">Peak ELO</th>
                <th className="text-right px-3 py-2">Avg DMG</th>
              </tr></thead>
              <tbody>
                {leaderboard.byWinRate.map((p, i) => {
                  const isMe = p.steam_id === steamId;
                  return (
                    <tr key={p.steam_id} className={`border-b border-[#111] ${isMe ? "bg-[#ff6b35]/10" : "hover:bg-[#1a1a2e]"}`}>
                      <td className="px-3 py-2 text-[#ff6b35] font-bold">{i + 1}</td>
                      <td className="px-3 py-2">
                        <Link href={`/player/${p.steam_id}`} className={`hover:text-[#ff6b35] ${isMe ? "text-[#ff6b35] font-bold" : ""}`}>
                          {p.player_name}
                        </Link>
                        <BanBadge bans={p.bans} />
                      </td>
                      <td className="px-3 py-2 text-right">{p.matches}</td>
                      <td className="px-3 py-2 text-right">{p.wins}-{p.losses}</td>
                      <td className="px-3 py-2 text-right font-bold text-green-400">{p.win_rate.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right">{p.kdr.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-[#888]">{fmt(p.peak_elo)}</td>
                      <td className="px-3 py-2 text-right text-[#888]">{fmt(p.avg_damage)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== TOP 20 CURRENT ELO ===== */}
      {leaderboard && leaderboard.byElo.length > 0 && (
        <div>
          <h2 className="text-base font-bold uppercase tracking-wider mb-3">🏆 Top 20 by Current ELO (50+ Matches)</h2>
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[#1e1e2e] text-[#555] text-xs uppercase tracking-wider">
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Player</th>
                <th className="text-right px-3 py-2">Current ELO</th>
                <th className="text-right px-3 py-2">Peak ELO</th>
                <th className="text-right px-3 py-2">Matches</th>
                <th className="text-right px-3 py-2">W-L</th>
                <th className="text-right px-3 py-2">Win Rate</th>
                <th className="text-right px-3 py-2">KDR</th>
                <th className="text-right px-3 py-2">Avg DMG</th>
              </tr></thead>
              <tbody>
                {leaderboard.byElo.map((p, i) => {
                  const isMe = p.steam_id === steamId;
                  return (
                    <tr key={p.steam_id} className={`border-b border-[#111] ${isMe ? "bg-[#ff6b35]/10" : "hover:bg-[#1a1a2e]"}`}>
                      <td className="px-3 py-2 text-[#ff6b35] font-bold">{i + 1}</td>
                      <td className="px-3 py-2">
                        <Link href={`/player/${p.steam_id}`} className={`hover:text-[#ff6b35] ${isMe ? "text-[#ff6b35] font-bold" : ""}`}>
                          {p.player_name}
                        </Link>
                        <BanBadge bans={p.bans} />
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-[#ff6b35]">{fmt(p.current_elo)}</td>
                      <td className="px-3 py-2 text-right text-[#888]">{fmt(p.peak_elo)}</td>
                      <td className="px-3 py-2 text-right">{p.matches}</td>
                      <td className="px-3 py-2 text-right">{p.wins}-{p.losses}</td>
                      <td className="px-3 py-2 text-right">{p.win_rate.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right">{p.kdr.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-[#888]">{fmt(p.avg_damage)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== MATCH HISTORY ===== */}
      <div>
        <h2 className="text-base font-bold uppercase tracking-wider mb-3">📋 Match History <span className="text-[#888] text-sm font-normal normal-case">({fmt(matchTotal)} matches)</span></h2>
        {matchHistory.length === 0 && matchLoading ? (
          <div className="text-[#888] text-sm py-4">Loading matches...</div>
        ) : (
          <>
            <div className={`bg-[#12121a] border border-[#1e1e2e] rounded-xl overflow-hidden transition-opacity ${matchLoading ? "opacity-50" : "opacity-100"}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e1e2e] text-[#555] text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5">#</th>
                    <th className="text-left px-4 py-2.5">Date</th>
                    <th className="text-left px-4 py-2.5">Result</th>
                    <th className="text-left px-4 py-2.5">Score</th>
                    <th className="text-left px-4 py-2.5">Opponent</th>
                    <th className="text-right px-4 py-2.5">K/D</th>
                    <th className="text-right px-4 py-2.5">DMG</th>
                    <th className="text-right px-4 py-2.5">ELO</th>
                    <th className="text-right px-4 py-2.5">Δ ELO</th>
                  </tr>
                </thead>
                <tbody>
                  {matchHistory.map((m: any, i: number) => {
                    const isWin = m.side === "winner";
                    const eloChange = Number(m.elo_change);
                    const matchNum = (matchPage - 1) * 25 + i + 1;
                    return (
                      <tr key={`${m.match_id}-${i}`} className="border-b border-[#1e1e2e]/50 hover:bg-[#1e1e2e]/30 transition">
                        <td className="px-4 py-2 text-[#555] text-xs">{matchNum}</td>
                        <td className="px-4 py-2 text-xs text-[#888] whitespace-nowrap">{m.date} <span className="text-[#555]">{String(m.time_utc || '').slice(0, 5)}</span></td>
                        <td className="px-4 py-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${isWin ? "bg-[#4ade80]/20 text-[#4ade80]" : "bg-[#f87171]/20 text-[#f87171]"}`}>
                            {isWin ? "WIN" : "LOSS"}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-bold text-[#888]">{m.rounds_won}-{m.opp_rounds}</td>
                        <td className="px-4 py-2">
                          <Link href={`/player/${m.opp_steam_id}`} className="hover:text-[#ff6b35] transition">{m.opp_name}</Link>
                          <span className="text-[#555] text-xs ml-2">({fmt(Number(m.opp_elo))})</span>
                        </td>
                        <td className="px-4 py-2 text-right text-[#888]">{m.kills}-{m.deaths}</td>
                        <td className="px-4 py-2 text-right text-[#888]">{m.damage}</td>
                        <td className="px-4 py-2 text-right text-[#888]">{fmt(Number(m.elo))}</td>
                        <td className={`px-4 py-2 text-right font-bold ${eloChange >= 0 ? "text-[#4ade80]" : "text-[#f87171]"}`}>
                          {eloChange >= 0 ? "+" : ""}{eloChange}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {matchTotalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <button
                  onClick={() => fetchMatches(matchPage - 1)}
                  disabled={matchPage <= 1}
                  className="px-3 py-1.5 bg-[#1e1e2e] rounded text-sm disabled:opacity-30 hover:bg-[#2a2a3e] transition"
                >
                  ← Prev
                </button>
                <span className="text-[#888] text-sm">
                  Page {matchPage} of {matchTotalPages}
                </span>
                <button
                  onClick={() => fetchMatches(matchPage + 1)}
                  disabled={matchPage >= matchTotalPages}
                  className="px-3 py-1.5 bg-[#1e1e2e] rounded text-sm disabled:opacity-30 hover:bg-[#2a2a3e] transition"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-[#333] text-xs pt-4 border-t border-[#1e1e2e]">
        PAT Ranked Stats • Data from PAT Discord
      </div>
    </div>
  );
}

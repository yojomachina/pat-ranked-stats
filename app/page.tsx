"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface SearchResult {
  steam_id: string;
  player_name: string;
  matches: number;
  avatar_url: string | null;
}

interface LeaderboardEntry {
  steam_id: string;
  player_name: string;
  matches: number;
  wins: number;
  win_rate: number;
  total_kills: number;
  total_deaths: number;
  vac_banned: number;
  number_of_game_bans: number;
}

interface RecentMatch {
  match_id: string; date: string; time_utc: string; match_type: string;
  winner_name: string; winner_id: string; winner_elo: number; winner_elo_change: number;
  winner_kills: number; winner_deaths: number; winner_damage: number; winner_rounds: number;
  loser_name: string; loser_id: string; loser_elo: number; loser_elo_change: number;
  loser_kills: number; loser_deaths: number; loser_damage: number; loser_rounds: number;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [stats, setStats] = useState({ totalPlayers: 0, totalMatches: 0 });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetch("/api/stats").then(r => r.json()).then(setStats).catch(() => {});
    fetch("/api/leaderboards?type=winrate&page=1")
      .then(r => r.json())
      .then(d => setLeaderboard(d.slice(0, 10)))
      .catch(() => {});
    fetch("/api/recent-matches?limit=100")
      .then(r => r.json())
      .then(d => setRecentMatches(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const extractSteamId = (input: string): string => {
    // Full steam profile URL: https://steamcommunity.com/profiles/76561198022229325
    const profileMatch = input.match(/steamcommunity\.com\/profiles\/(\d{17})/);
    if (profileMatch) return profileMatch[1];
    // Just return as-is (name or raw steam ID)
    return input.trim();
  };

  const search = useCallback((q: string) => {
    if (q.length < 2) { setResults([]); return; }
    const parsed = extractSteamId(q);
    // If we extracted a steam ID from URL, navigate directly
    if (parsed !== q.trim() && /^\d{17}$/.test(parsed)) {
      window.location.href = `/player/${parsed}`;
      return;
    }
    setSearching(true);
    fetch(`/api/search?q=${encodeURIComponent(parsed)}`)
      .then(r => r.json())
      .then(d => { setResults(d); setSearching(false); })
      .catch(() => setSearching(false));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  return (
    <div className="space-y-12">
      {/* Hero */}
      <div className="text-center pt-8 pb-4">
        <h1 className="text-4xl font-bold mb-2">
          <span className="text-[#ff6b35]">PAT</span> Ranked Stats
        </h1>
        <p className="text-[#888] mb-8">Rust competitive match tracking & analytics</p>

        {/* Search */}
        <div className="relative max-w-xl mx-auto">
          <input
            type="text"
            placeholder="Search by name, Steam ID, or Steam profile URL..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full bg-[#12121a] border border-[#1e1e2e] rounded-lg px-4 py-3 text-[#e0e0e0] placeholder-[#555] focus:outline-none focus:border-[#ff6b35] transition"
          />
          {searching && <div className="absolute right-3 top-3.5 text-[#888] text-sm">...</div>}
          {results.length > 0 && query.length >= 2 && (
            <div className="absolute w-full mt-1 bg-[#12121a] border border-[#1e1e2e] rounded-lg overflow-hidden z-10 max-h-80 overflow-y-auto">
              {results.map(r => (
                <Link
                  key={r.steam_id}
                  href={`/player/${r.steam_id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#1e1e2e] transition"
                >
                  {r.avatar_url && (
                    <img src={r.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                  )}
                  <div className="text-left">
                    <div className="text-sm font-medium">{r.player_name}</div>
                    <div className="text-xs text-[#888]">{r.matches} matches</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex justify-center gap-8">
        <div className="text-center">
          <div className="text-3xl font-bold text-[#ff6b35]">{stats.totalPlayers.toLocaleString()}</div>
          <div className="text-[#888] text-sm">Players</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-[#ff6b35]">{stats.totalMatches.toLocaleString()}</div>
          <div className="text-[#888] text-sm">Matches</div>
        </div>
      </div>

      {/* Leaderboard Preview */}
      {leaderboard.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Top Win Rates <span className="text-[#888] text-sm font-normal">(50+ matches)</span></h2>
            <Link href="/leaderboards" className="text-[#ff6b35] text-sm hover:underline">View All →</Link>
          </div>
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e] text-[#888]">
                  <th className="text-left px-4 py-2.5">#</th>
                  <th className="text-left px-4 py-2.5">Player</th>
                  <th className="text-right px-4 py-2.5">Matches</th>
                  <th className="text-right px-4 py-2.5">Win Rate</th>
                  <th className="text-right px-4 py-2.5">KDR</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((p, i) => (
                  <tr key={p.steam_id} className="border-b border-[#1e1e2e]/50 hover:bg-[#1e1e2e]/30 transition">
                    <td className="px-4 py-2.5 text-[#888]">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/player/${p.steam_id}`} className="hover:text-[#ff6b35] transition">
                        {p.player_name}
                        {(p.vac_banned || p.number_of_game_bans > 0) && (
                          <span className="ml-2 text-xs bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded">BAN</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#888]">{p.matches}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-[#ff6b35]">{p.win_rate}%</td>
                    <td className="px-4 py-2.5 text-right text-[#888]">
                      {p.total_deaths > 0 ? (p.total_kills / p.total_deaths).toFixed(2) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Matches */}
      {recentMatches.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">⚔️ Recent Matches</h2>
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e] text-[#888]">
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-left px-4 py-2.5">Winner</th>
                  <th className="text-center px-4 py-2.5">Score</th>
                  <th className="text-right px-4 py-2.5">Loser</th>
                  <th className="text-right px-4 py-2.5">W ELO</th>
                  <th className="text-right px-4 py-2.5">L ELO</th>
                  <th className="text-right px-4 py-2.5">K/D</th>
                </tr>
              </thead>
              <tbody>
                {recentMatches.map((m, i) => (
                  <tr key={`${m.match_id}-${i}`} className="border-b border-[#1e1e2e]/50 hover:bg-[#1e1e2e]/30 transition">
                    <td className="px-4 py-2 text-[#555] text-xs whitespace-nowrap">{m.date}<br/><span className="text-[#444]">{m.time_utc?.slice(0,5)} UTC</span></td>
                    <td className="px-4 py-2">
                      <Link href={`/player/${m.winner_id}`} className="text-[#4ade80] hover:underline font-medium">{m.winner_name}</Link>
                      <span className="text-[#555] text-xs ml-2">+{m.winner_elo_change}</span>
                    </td>
                    <td className="px-4 py-2 text-center font-bold text-[#888]">{m.winner_rounds}-{m.loser_rounds}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/player/${m.loser_id}`} className="text-[#f87171] hover:underline font-medium">{m.loser_name}</Link>
                      <span className="text-[#555] text-xs ml-2">{m.loser_elo_change}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-[#888]">{Number(m.winner_elo).toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-xs text-[#888]">{Number(m.loser_elo).toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-xs text-[#888]">
                      {m.winner_kills}-{m.winner_deaths}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

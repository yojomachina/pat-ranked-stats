"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

type TabType = "winrate" | "elo" | "active" | "kdr";

interface Entry {
  steam_id: string; player_name: string; matches: number; wins?: number;
  win_rate?: number; peak_elo?: number; total_kills?: number; total_deaths?: number;
  kdr?: number; vac_banned?: number; number_of_game_bans?: number;
}

const TABS: { key: TabType; label: string }[] = [
  { key: "winrate", label: "Win Rate" },
  { key: "elo", label: "Peak ELO" },
  { key: "active", label: "Most Active" },
  { key: "kdr", label: "Best KDR" },
];

export default function Leaderboards() {
  const [tab, setTab] = useState<TabType>("winrate");
  const [data, setData] = useState<Entry[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboards?type=${tab}&page=${page}`)
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tab, page]);

  const BanBadge = ({ e }: { e: Entry }) =>
    (e.vac_banned || (e.number_of_game_bans ?? 0) > 0)
      ? <span className="ml-2 text-xs bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded">BAN</span>
      : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold"><span className="text-[#ff6b35]">Leaderboards</span></h1>

      <div className="flex gap-1 border-b border-[#1e1e2e]">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            className={`px-4 py-2 text-sm transition ${tab === t.key ? "text-[#ff6b35] border-b-2 border-[#ff6b35]" : "text-[#888] hover:text-[#e0e0e0]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-10 text-[#888]">Loading...</div>
      ) : (
        <div className="bg-[#12121a] border border-[#1e1e2e] rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e] text-[#888]">
                <th className="text-left px-4 py-2.5">#</th>
                <th className="text-left px-4 py-2.5">Player</th>
                <th className="text-right px-4 py-2.5">Matches</th>
                {tab === "winrate" && <><th className="text-right px-4 py-2.5">Wins</th><th className="text-right px-4 py-2.5">Win Rate</th><th className="text-right px-4 py-2.5">KDR</th></>}
                {tab === "elo" && <th className="text-right px-4 py-2.5">Peak ELO</th>}
                {tab === "active" && <><th className="text-right px-4 py-2.5">Wins</th><th className="text-right px-4 py-2.5">Win Rate</th></>}
                {tab === "kdr" && <><th className="text-right px-4 py-2.5">KDR</th><th className="text-right px-4 py-2.5">Kills</th><th className="text-right px-4 py-2.5">Deaths</th></>}
              </tr>
            </thead>
            <tbody>
              {data.map((e, i) => (
                <tr key={e.steam_id} className="border-b border-[#1e1e2e]/50 hover:bg-[#1e1e2e]/30">
                  <td className="px-4 py-2 text-[#888]">{(page - 1) * 50 + i + 1}</td>
                  <td className="px-4 py-2">
                    <Link href={`/player/${e.steam_id}`} className="hover:text-[#ff6b35] transition">
                      {e.player_name}<BanBadge e={e} />
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right text-[#888]">{e.matches}</td>
                  {tab === "winrate" && <>
                    <td className="px-4 py-2 text-right">{e.wins}</td>
                    <td className="px-4 py-2 text-right font-medium text-[#ff6b35]">{e.win_rate}%</td>
                    <td className="px-4 py-2 text-right text-[#888]">{e.total_deaths ? (Number(e.total_kills) / Number(e.total_deaths)).toFixed(2) : "-"}</td>
                  </>}
                  {tab === "elo" && <td className="px-4 py-2 text-right font-medium text-[#ff6b35]">{e.peak_elo}</td>}
                  {tab === "active" && <>
                    <td className="px-4 py-2 text-right">{e.wins}</td>
                    <td className="px-4 py-2 text-right text-[#ff6b35]">{e.win_rate}%</td>
                  </>}
                  {tab === "kdr" && <>
                    <td className="px-4 py-2 text-right font-medium text-[#ff6b35]">{e.kdr}</td>
                    <td className="px-4 py-2 text-right">{e.total_kills}</td>
                    <td className="px-4 py-2 text-right text-[#888]">{e.total_deaths}</td>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-center gap-3">
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
          className="px-4 py-2 text-sm bg-[#12121a] border border-[#1e1e2e] rounded hover:bg-[#1e1e2e] disabled:opacity-30 transition"
        >
          ← Prev
        </button>
        <span className="px-4 py-2 text-sm text-[#888]">Page {page}</span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={data.length < 50}
          className="px-4 py-2 text-sm bg-[#12121a] border border-[#1e1e2e] rounded hover:bg-[#1e1e2e] disabled:opacity-30 transition"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

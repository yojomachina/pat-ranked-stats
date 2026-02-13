// Known PAT seasons with date boundaries (4AM EST = 09:00 UTC)
export const KNOWN_SEASONS: { id: string; label: string; from: string; to: string }[] = [
  { id: "S50", label: "Season 50", from: "2025-01-01", to: "2026-01-23" },
  { id: "S51", label: "Season 51", from: "2026-01-23", to: "2026-02-09" },
  { id: "S52", label: "Season 52", from: "2026-02-09", to: "2026-02-23" },
  { id: "S53", label: "Season 53", from: "2026-02-23", to: "2026-03-09" },
  { id: "S54", label: "Season 54", from: "2026-03-09", to: "2026-03-23" },
];

export function getSeasonFilter(searchParams: URLSearchParams): { fromDate?: string; toDate?: string } {
  const season = searchParams.get("season");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (from && to) return { fromDate: from, toDate: to };
  if (season) {
    const s = KNOWN_SEASONS.find((k) => k.id === season);
    if (s) return { fromDate: s.from, toDate: s.to };
  }
  return {};
}

export function appendDateFilter(baseSql: string, args: (string | number)[], filter: { fromDate?: string; toDate?: string }): string {
  let sql = baseSql;
  if (filter.fromDate) { sql += " AND date >= ?"; args.push(filter.fromDate); }
  if (filter.toDate) { sql += " AND date < ?"; args.push(filter.toDate); }
  return sql;
}

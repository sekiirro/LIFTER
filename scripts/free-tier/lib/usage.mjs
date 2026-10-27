import { pct, verdict } from './stats.mjs';

export function usageReport(totalBytes, rows, counts = {}, limitMb = 500) {
  const limitBytes = limitMb * 1000000;
  const total = Number(totalBytes);
  return {
    total_bytes: total,
    limit_bytes: limitBytes,
    pct: pct(total, limitBytes),
    verdict: verdict(total, limitBytes),
    tables: rows.map((row) => {
      const bytes = Number(row.total_bytes);
      return {
        table: row.table,
        total_bytes: bytes,
        reltuples: Number(row.reltuples),
        ...(Object.hasOwn(counts, row.table)
          ? { exact_count: Number(counts[row.table]) }
          : {}),
        pct: pct(bytes, limitBytes),
        verdict: verdict(bytes, limitBytes),
      };
    }),
    counts: Object.fromEntries(
      Object.entries(counts).map(([table, count]) => [table, Number(count)]),
    ),
  };
}

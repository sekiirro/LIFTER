import { pct, verdict } from './stats.mjs';

export function projectUsage(usage, volumes, limitMb = 500) {
  const limitBytes = limitMb * 1000000;
  pct(0, limitBytes);
  const missing = [];
  const tables = usage.tables.map((row) => {
    const bytes = Number(row.total_bytes);
    const estimate = Number(row.reltuples);
    if (!Number.isFinite(estimate) || !Number.isFinite(bytes) || bytes < 0)
      throw new Error('Invalid usage data');
    const bytesPerRow = bytes / Math.max(estimate, 1);
    const volume = Object.hasOwn(volumes, row.table)
      ? volumes[row.table]
      : null;
    if (volume === null) missing.push(row.table);
    else if (!Number.isSafeInteger(volume) || volume < 0)
      throw new Error('Invalid volume');
    return {
      table: row.table,
      bytes_per_row: bytesPerRow,
      expected_rows: volume,
      projected_bytes: volume === null ? null : bytesPerRow * volume,
      status: volume === null ? 'MISSING' : 'provided',
    };
  });
  const total = tables.reduce(
    (sum, row) => sum + (row.projected_bytes ?? 0),
    0,
  );
  return {
    tables,
    missing,
    complete: missing.length === 0,
    total_bytes: total,
    limit_bytes: limitBytes,
    pct: pct(total, limitBytes),
    verdict: verdict(total, limitBytes),
  };
}

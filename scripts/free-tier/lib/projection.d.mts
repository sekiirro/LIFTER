import type { UsageRow } from './usage.mjs';
export function projectUsage(
  usage: { tables: UsageRow[] },
  volumes: Record<string, unknown>,
  limitMb?: number,
): {
  tables: {
    table: string;
    bytes_per_row: number;
    expected_rows: number | null;
    projected_bytes: number | null;
    status: string;
  }[];
  missing: string[];
  complete: boolean;
  total_bytes: number;
  limit_bytes: number;
  pct: number;
  verdict: 'ok' | 'warn' | 'over';
};

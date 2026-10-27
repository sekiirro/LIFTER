export interface UsageRow {
  table: string;
  total_bytes: number | string;
  reltuples: number | string;
}
export interface UsageReport {
  total_bytes: number;
  limit_bytes: number;
  pct: number;
  verdict: 'ok' | 'warn' | 'over';
  tables: (UsageRow & {
    total_bytes: number;
    reltuples: number;
    exact_count?: number;
    pct: number;
    verdict: 'ok' | 'warn' | 'over';
  })[];
  counts: Record<string, number>;
}
export function usageReport(
  totalBytes: number | string,
  rows: UsageRow[],
  counts?: Record<string, number | string>,
  limitMb?: number,
): UsageReport;

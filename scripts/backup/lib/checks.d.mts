import type { Sql } from 'postgres';
export type Checks = Record<string, { count: string; checksum: string }>;
export function collectChecks(sql: Sql): Promise<Checks>;
export function compareChecks(
  expected: Checks,
  actual: Checks,
): { ok: boolean; mismatches: string[] };

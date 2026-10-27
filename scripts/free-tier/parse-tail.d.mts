export function parseTail(
  text: string,
  cpuLimitMs?: number,
): {
  invalid_lines: number;
  cpu_limit_ms: number;
  routes: {
    route: string;
    count: number;
    cpu_p50_ms: number | null;
    cpu_p95_ms: number | null;
    cpu_max_ms: number | null;
    wall_p50_ms: number | null;
    wall_p95_ms: number | null;
    verdict: 'ok' | 'warn' | 'over' | null;
    outcomes: Record<string, number>;
  }[];
};
export function main(args?: string[]): Promise<void>;

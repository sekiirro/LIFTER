export function probe(
  baseUrl: string,
  routes: { path: string }[],
  n?: number,
  concurrency?: number,
  request?: typeof fetch,
): Promise<
  {
    route: string;
    count: number;
    statuses: Record<string, number>;
    p50_ms: number;
    p95_ms: number;
    median_bytes: number;
  }[]
>;

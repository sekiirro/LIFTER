export function buildHealth(version: string) {
  return { status: 'ok' as const, version };
}

export class UsageError extends Error {}
export function parseArgs(
  argv: string[],
  values: string[],
  booleans?: string[],
): Record<string, string | boolean>;
export function requireArgs(
  args: Record<string, string | boolean>,
  names: string[],
): void;

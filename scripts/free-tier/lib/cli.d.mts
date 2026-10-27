export function positive(
  value: string | number | undefined,
  fallback: number,
): number;
export function output(report: unknown, path?: string): Promise<void>;
export function run(main: () => Promise<void>): void;
export function isMain(url: string): boolean;

export function parseStoragePlaywrightSummary(output: string): {
  passed: number;
  skipped: number;
  failed: number;
  flaky: number;
  interrupted: number;
  acceptable: boolean;
};

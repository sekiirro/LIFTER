export function hasCapturedServerLogs(value: unknown): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'captureStarted' in value &&
    value.captureStarted === true &&
    'totalLines' in value &&
    typeof value.totalLines === 'number' &&
    Number.isSafeInteger(value.totalLines) &&
    value.totalLines > 0
  );
}

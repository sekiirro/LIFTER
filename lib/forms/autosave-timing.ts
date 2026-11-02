export const AUTOSAVE_DEBOUNCE_MS = 1_500;
export const AUTOSAVE_MAX_UNSAVED_MS = 10_000;
export const AUTOSAVE_REQUEST_TIMEOUT_MS = 10_000;

export function nextAutosaveRetryDelay(failedAttempts: number): number {
  return [2_000, 4_000, 8_000][failedAttempts - 1] ?? 30_000;
}

export function scheduleDraftAutosave(
  save: () => void,
  firstDirtyAt: number,
  now = Date.now(),
): () => void {
  const debounce = setTimeout(save, AUTOSAVE_DEBOUNCE_MS);
  const maxUnsaved = setTimeout(
    save,
    Math.max(0, AUTOSAVE_MAX_UNSAVED_MS - (now - firstDirtyAt)),
  );
  return () => {
    clearTimeout(debounce);
    clearTimeout(maxUnsaved);
  };
}

export async function withAutosaveTimeout<T>(
  request: Promise<T>,
  timeoutMs = AUTOSAVE_REQUEST_TIMEOUT_MS,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('autosave_timeout')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

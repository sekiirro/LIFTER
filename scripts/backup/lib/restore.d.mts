export const RESTORE_EXCLUSIONS: string;
export function mergeReason(current: string, secondary: string): string;
export function teardownRestoreStack(
  workdir: string,
  keepStack: boolean,
  dependencies?: {
    stop?: (args: string[]) => Promise<unknown>;
    remove?: (
      path: string,
      options: { recursive: boolean; force: boolean },
    ) => Promise<unknown>;
  },
): Promise<void>;

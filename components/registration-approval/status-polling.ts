import { isApprovedClientDestination } from '../../lib/client-access/routes';

export type ClientStatusResult =
  | {
      status: 'ok';
      approval_state: 'pending-approval' | 'approved' | 'rejected';
    }
  | { status: 'not_permitted' | 'unavailable' };

export async function performApprovedStatusRedirect({
  preflight,
  navigate,
}: {
  preflight: () => Promise<
    ClientStatusResult | { status: 'ok'; destination: string }
  >;
  navigate: (destination: '/' | `/forms/${string}`) => void;
}): Promise<'redirected' | 'fallback' | 'not_permitted'> {
  let result: ClientStatusResult | { status: 'ok'; destination: string };
  try {
    result = await preflight();
  } catch {
    return 'fallback';
  }
  if (result.status === 'not_permitted') return 'not_permitted';
  if (
    result.status !== 'ok' ||
    !('destination' in result) ||
    !isApprovedClientDestination(result.destination)
  )
    return 'fallback';
  try {
    navigate(result.destination);
    return 'redirected';
  } catch {
    return 'fallback';
  }
}

export type StatusPollRuntime = {
  visible: () => boolean;
  online: () => boolean;
  setTimeout: (callback: () => void, delay: number) => unknown;
  clearTimeout: (timer: unknown) => void;
  listen: (listener: () => void) => () => void;
};

export const STATUS_POLL_INTERVAL_MS = 15_000;
export const STATUS_POLL_MAX_ATTEMPTS = 12;

export function createStatusPoller({
  runtime,
  load,
  onResult,
  onAttempt,
  onBusy,
  initialState = 'pending-approval',
}: {
  runtime: StatusPollRuntime;
  load: () => Promise<ClientStatusResult>;
  onResult?: (result: ClientStatusResult) => void | Promise<void>;
  onAttempt?: (attempts: number) => void;
  onBusy?: (busy: boolean) => void;
  initialState?:
    | 'pending-approval'
    | 'approved'
    | 'rejected'
    | 'not_permitted'
    | 'unavailable';
}) {
  let timer: unknown | undefined;
  let unsubscribe: (() => void) | undefined;
  let inFlight = false;
  let disposed = false;
  let automaticStopped =
    initialState !== 'pending-approval' && initialState !== 'unavailable';
  let authLost = false;
  let currentState = initialState;
  let automaticAttempts = 0;

  const clearTimer = () => {
    if (timer !== undefined) runtime.clearTimeout(timer);
    timer = undefined;
  };

  const schedule = () => {
    if (
      disposed ||
      automaticStopped ||
      inFlight ||
      timer !== undefined ||
      automaticAttempts >= STATUS_POLL_MAX_ATTEMPTS ||
      currentState !== 'pending-approval' ||
      !runtime.visible() ||
      !runtime.online()
    )
      return;
    timer = runtime.setTimeout(() => {
      timer = undefined;
      void run(false);
    }, STATUS_POLL_INTERVAL_MS);
  };

  const run = async (manual: boolean): Promise<boolean> => {
    if (disposed || inFlight || (manual && authLost)) return false;
    if (
      !manual &&
      (automaticStopped || !runtime.visible() || !runtime.online())
    )
      return false;
    if (!manual) {
      automaticAttempts += 1;
      onAttempt?.(automaticAttempts);
    }
    inFlight = true;
    onBusy?.(true);
    try {
      const result = await load();
      if (result.status === 'ok') currentState = result.approval_state;
      if (result.status === 'not_permitted') {
        authLost = true;
        automaticStopped = true;
      } else if (
        result.status === 'ok' &&
        result.approval_state !== 'pending-approval'
      ) {
        automaticStopped = true;
      }
      await onResult?.(result);
    } catch {
      try {
        await onResult?.({ status: 'unavailable' });
      } catch {
        // A refresh failure remains a safe unavailable status.
      }
    } finally {
      inFlight = false;
      onBusy?.(false);
      schedule();
    }
    return true;
  };

  const onRuntimeChange = () => {
    if (!runtime.visible() || !runtime.online()) clearTimer();
    else schedule();
  };

  return {
    start() {
      if (disposed || unsubscribe) return;
      unsubscribe = runtime.listen(onRuntimeChange);
      schedule();
    },
    stop() {
      disposed = true;
      clearTimer();
      unsubscribe?.();
      unsubscribe = undefined;
    },
    refresh() {
      return run(true);
    },
    get attempts() {
      return automaticAttempts;
    },
  };
}

export const STAFF_RESET_MIN_RESPONSE_MS = 175;

export type StaffResetTimer = {
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
};

const realTimer: StaffResetTimer = {
  now: () => performance.now(),
  sleep: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

export async function withStaffResetMinimumResponse<T>(
  operation: () => Promise<T>,
  timer: StaffResetTimer = realTimer,
): Promise<T> {
  const started = timer.now();
  const result = await operation();
  const remaining = STAFF_RESET_MIN_RESPONSE_MS - (timer.now() - started);
  if (remaining > 0) await timer.sleep(remaining);
  return result;
}

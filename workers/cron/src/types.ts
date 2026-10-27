// Minimal structural types for this Worker's only Cloudflare entry point.
export type ScheduledController = {
  scheduledTime: number;
  cron: string;
  noRetry(): void;
};

export type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

import { it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

it.skipIf(process.env.SC011_TIMING_RUN !== 'true')(
  'SC-011 measures the real admitted production signup path',
  async () => {
    const { runTiming } =
      await import('../../scripts/verify-client-signup-timing.mjs');
    await runTiming();
  },
  240_000,
);

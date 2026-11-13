import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadEnv: vi.fn(),
  postgres: vi.fn(),
}));

vi.mock('postgres', () => ({ default: mocks.postgres }));
vi.mock('../integration/harness', () => ({ loadEnv: mocks.loadEnv }));

import { withCrashSafeFunctionMutant } from '../integration/function-drift-guard';

it('preserves probe and restore failures while closing the mutation connection', async () => {
  const probeError = new Error('synthetic probe assertion');
  const restoreError = new Error('synthetic restore failure');
  const unsafe = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(restoreError);
  const end = vi.fn().mockResolvedValue(undefined);
  let queryCount = 0;
  const db = Object.assign(
    vi.fn(() => {
      queryCount += 1;
      return Promise.resolve(
        queryCount === 1
          ? [
              {
                definition: 'create function synthetic() returns void as $$ $$',
                md5: 'original',
              },
            ]
          : [{ md5: 'original' }],
      );
    }),
    { unsafe, end },
  );
  mocks.loadEnv.mockReturnValue({ dbUrl: 'postgres://synthetic' });
  mocks.postgres.mockReturnValue(db);

  let caught: unknown;
  try {
    await withCrashSafeFunctionMutant(
      'public.synthetic() ',
      (definition) => definition + ' -- mutant',
      async () => {
        throw probeError;
      },
    );
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(AggregateError);
  expect((caught as AggregateError).errors).toEqual([probeError, restoreError]);
  expect(end).toHaveBeenCalledOnce();
});

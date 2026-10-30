import { describe, expect, it } from 'vitest';
import {
  assertLocalStackTarget,
  getStackConfig,
  localSupabaseContainer,
  selectStack,
} from '../../scripts/local-stack.mjs';

describe('isolated local Supabase Stack D contract', () => {
  it('selects only the configured local stack identifiers', () => {
    expect(selectStack({ LIFTER_SUPABASE_STACK: 'd' })).toBe('d');
    expect(() => selectStack({ LIFTER_SUPABASE_STACK: 'e' })).toThrow(
      'Unsupported local Supabase stack',
    );
  });

  it('binds D to its project and complete disjoint port block', () => {
    const stackA = getStackConfig('a');
    const stackD = getStackConfig('d');

    expect(stackD.projectId).toBe('lifter-stack-d');
    expect(stackD.ports).toEqual([
      45421, 45422, 45420, 45423, 45424, 45425, 45426, 45427, 45428, 45429,
    ]);
    expect(new Set(stackD.ports).size).toBe(stackD.ports.length);
    expect(
      stackD.ports.some(
        (port) =>
          port !== undefined &&
          [
            25420, 25421, 25422, 25423, 25424, 25425, 25426, 25427, 25428,
            25429, 35420, 35421, 35422, 35423, 35424, 35425, 35426, 35427,
            35428, 35429,
          ].includes(port),
      ),
    ).toBe(false);
    expect(stackA.ports.filter((port) => stackD.ports.includes(port))).toEqual(
      [],
    );
    expect(stackD.configText).toMatch(/\[storage\]\s*\nenabled\s*=\s*true/);
    expect(stackD.configText).toMatch(/\[inbucket\]\s*\nenabled\s*=\s*true/);
  });

  it('guards D API and DB targets and derives its Docker container names', () => {
    expect(
      assertLocalStackTarget({
        stack: 'd',
        apiUrl: 'http://127.0.0.1:45421',
        dbUrl: 'postgres://postgres:postgres@127.0.0.1:45422/postgres',
      }).projectId,
    ).toBe('lifter-stack-d');
    expect(() =>
      assertLocalStackTarget({
        stack: 'd',
        apiUrl: 'http://127.0.0.1:54321',
        dbUrl: 'postgres://postgres:postgres@127.0.0.1:54322/postgres',
      }),
    ).toThrow('Local Supabase target required');

    expect(localSupabaseContainer('db', 'd')).toBe(
      'supabase_db_lifter-stack-d',
    );
  });
});

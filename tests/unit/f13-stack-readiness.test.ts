import { describe, expect, it } from 'vitest';
import {
  assertLocalStackTarget,
  getStackConfig,
  selectStack,
} from '../../scripts/local-stack.mjs';

describe('F13 isolated Stack C contract', () => {
  it('selects only Stack C when explicitly requested', () => {
    expect(selectStack({ LIFTER_SUPABASE_STACK: 'c' })).toBe('c');
    for (const invalid of ['C', 'remote']) {
      expect(() => selectStack({ LIFTER_SUPABASE_STACK: invalid })).toThrow(
        'Unsupported local Supabase stack',
      );
    }
  });

  it('binds Stack C to its own project and full distinct port block', () => {
    const config = getStackConfig('c');
    expect(config.projectId).toBe('lifter-stack-c');
    expect(config.ports).toEqual([
      35421, 35422, 35420, 35423, 35424, 35425, 35426, 35427, 35428, 35429,
    ]);
    expect(new Set(config.ports).size).toBe(config.ports.length);
    expect(config.workdir.endsWith('supabase-stack-c')).toBe(true);
  });

  it('rejects Stack A and B API or DB targets', () => {
    for (const [apiUrl, dbUrl] of [
      [
        'http://127.0.0.1:54321',
        'postgres://postgres:postgres@127.0.0.1:35422/postgres',
      ],
      [
        'http://127.0.0.1:25421',
        'postgres://postgres:postgres@127.0.0.1:35422/postgres',
      ],
      [
        'http://127.0.0.1:35421',
        'postgres://postgres:postgres@127.0.0.1:54322/postgres',
      ],
      [
        'http://127.0.0.1:35421',
        'postgres://postgres:postgres@127.0.0.1:25422/postgres',
      ],
    ]) {
      expect(() =>
        assertLocalStackTarget({ stack: 'c', apiUrl, dbUrl }),
      ).toThrow('Local Supabase target required');
    }
  });

  it('accepts only the Stack C loopback API and database endpoints', () => {
    expect(
      assertLocalStackTarget({
        stack: 'c',
        apiUrl: 'http://127.0.0.1:35421',
        dbUrl: 'postgres://postgres:postgres@127.0.0.1:35422/postgres',
      }).projectId,
    ).toBe('lifter-stack-c');
  });
});

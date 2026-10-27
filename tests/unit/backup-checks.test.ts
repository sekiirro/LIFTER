import { describe, expect, it } from 'vitest';
import { compareChecks } from '../../scripts/backup/lib/checks.mjs';

describe('verification comparisons', () => {
  const expected = {
    'public.a': { count: '2', checksum: 'abc' },
    'auth.users': { count: '0', checksum: 'def' },
  };
  it('compares maps independent of key order', () => {
    expect(
      compareChecks(expected, {
        'auth.users': expected['auth.users'],
        'public.a': expected['public.a'],
      }),
    ).toEqual({ ok: true, mismatches: [] });
    expect(compareChecks({}, {})).toEqual({ ok: true, mismatches: [] });
  });
  it('detects missing, extra, changed count and changed content', () => {
    for (const actual of [
      {},
      { ...expected, extra: { count: '0', checksum: '' } },
      { ...expected, 'public.a': { count: '3', checksum: 'abc' } },
      { ...expected, 'public.a': { count: '2', checksum: 'changed' } },
    ]) {
      expect(compareChecks(expected, actual).ok).toBe(false);
    }
    expect(compareChecks(expected, {}).mismatches).toEqual([
      'auth.users',
      'public.a',
    ]);
  });
});

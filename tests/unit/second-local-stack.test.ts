import { describe, expect, it } from 'vitest';
import {
  assertLocalStackTarget,
  getStackConfig,
  selectStack,
} from '../../scripts/local-stack.mjs';
import { localSupabaseContainer } from '../integration/local-docker';

describe('isolated local Supabase stack contract', () => {
  it('selects A by default and supports explicit A-D profiles', () => {
    expect(selectStack({})).toBe('a');
    expect(selectStack({ LIFTER_SUPABASE_STACK: 'a' })).toBe('a');
    expect(selectStack({ LIFTER_SUPABASE_STACK: 'b' })).toBe('b');
    expect(selectStack({ LIFTER_SUPABASE_STACK: 'c' })).toBe('c');
    expect(selectStack({ LIFTER_SUPABASE_STACK: 'd' })).toBe('d');
    expect(selectStack({ LIFTER_SUPABASE_STACK: '' })).toBe('a');
    for (const invalid of ['remote', 'B', 'e']) {
      expect(() => selectStack({ LIFTER_SUPABASE_STACK: invalid })).toThrow(
        'Unsupported local Supabase stack',
      );
    }
  });

  it('infers the selected local profile from CI-shaped endpoint variables', () => {
    expect(
      selectStack({
        API_URL: 'http://127.0.0.1:25421',
        DB_URL: 'postgres://postgres:postgres@127.0.0.1:25422/postgres',
      }),
    ).toBe('b');
    expect(
      selectStack({
        API_URL: 'http://127.0.0.1:54321',
        DB_URL: 'postgres://postgres:postgres@127.0.0.1:54322/postgres',
      }),
    ).toBe('a');
  });

  it('binds stack B to its separate project and complete port block', () => {
    const stackA = getStackConfig('a');
    const stackB = getStackConfig('b');

    expect(stackA.projectId).toBe('lifter');
    expect(stackB.projectId).toBe('lifter-stack-b');
    expect(stackB.envFile).toContain('.env.stack-b');
    expect(stackB.ports).toEqual([
      25421, 25422, 25420, 25423, 25424, 25425, 25426, 25427, 25428, 25429,
    ]);
    expect(new Set(stackB.ports).size).toBe(stackB.ports.length);

    expect(stackA.ports.filter((port) => stackB.ports.includes(port))).toEqual(
      [],
    );
  });

  it('requires a loopback API and database target matching the selected stack', () => {
    expect(
      assertLocalStackTarget({
        stack: 'b',
        apiUrl: 'http://127.0.0.1:25421',
        dbUrl: 'postgres://postgres:postgres@127.0.0.1:25422/postgres',
      }).projectId,
    ).toBe('lifter-stack-b');

    for (const [apiUrl, dbUrl] of [
      [
        'https://project.supabase.co',
        'postgres://postgres:postgres@127.0.0.1:25422/postgres',
      ],
      [
        'http://192.168.1.20:25421',
        'postgres://postgres:postgres@127.0.0.1:25422/postgres',
      ],
      [
        'http://127.0.0.1:25421',
        'postgres://postgres:postgres@db.example.test:25422/postgres',
      ],
      [
        'http://127.0.0.1:25421',
        'postgres://postgres:postgres@127.0.0.1:54322/postgres',
      ],
      [
        'http://127.0.0.1:54321',
        'postgres://postgres:postgres@127.0.0.1:54322/postgres',
      ],
    ]) {
      expect(() =>
        assertLocalStackTarget({ stack: 'b', apiUrl, dbUrl }),
      ).toThrow('Local Supabase target required');
    }
  });

  it('requires Storage and Mailpit readiness in the B profile without connecting', () => {
    const stackB = getStackConfig('b');

    expect(stackB.configText).toMatch(/\[storage\]\s*\nenabled\s*=\s*true/);
    expect(stackB.configText).toMatch(/\[inbucket\]\s*\nenabled\s*=\s*true/);
    expect(stackB.configText).toContain('port = 25424');
    expect(stackB.configText).toContain('smtp_port = 25425');
    expect(stackB.configText).toContain('pop3_port = 25426');
  });

  it('names local Docker containers from the selected stack project', () => {
    const previous = process.env.LIFTER_SUPABASE_STACK;
    try {
      process.env.LIFTER_SUPABASE_STACK = 'b';
      expect(localSupabaseContainer('db')).toBe('supabase_db_lifter-stack-b');
      process.env.LIFTER_SUPABASE_STACK = 'a';
      expect(localSupabaseContainer('auth')).toBe('supabase_auth_lifter');
    } finally {
      if (previous === undefined) delete process.env.LIFTER_SUPABASE_STACK;
      else process.env.LIFTER_SUPABASE_STACK = previous;
    }
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertLocalStackTarget,
  getStackConfig,
  selectStack,
} from '../../scripts/local-stack.mjs';

describe('isolated local Supabase stack configuration', () => {
  it('uses distinct project IDs and disjoint effective port blocks', () => {
    const stackA = getStackConfig('a');
    const stackB = getStackConfig('b');
    expect(stackA.projectId).not.toBe(stackB.projectId);
    expect(new Set(stackA.ports).size).toBe(stackA.ports.length);
    expect(new Set(stackB.ports).size).toBe(stackB.ports.length);
    expect(stackA.ports.filter((port) => stackB.ports.includes(port))).toEqual(
      [],
    );
  });

  it('keeps signup and password security settings aligned', () => {
    const stackA = getStackConfig('a');
    const stackB = getStackConfig('b');
    expect(stackB.security).toEqual(stackA.security);
    expect(stackB.security).toEqual({
      enableSignup: false,
      minimumPasswordLength: 8,
    });
  });

  it('selects stack A by default and stack B only when explicitly requested', () => {
    expect(selectStack({})).toBe('a');
    expect(selectStack({ LIFTER_SUPABASE_STACK: 'a' })).toBe('a');
    expect(selectStack({ LIFTER_SUPABASE_STACK: 'b' })).toBe('b');
    expect(() => selectStack({ LIFTER_SUPABASE_STACK: 'remote' })).toThrow(
      'Unsupported local Supabase stack',
    );
  });

  it('rejects non-local hosts and endpoint ports that do not match the selected config', () => {
    expect(
      assertLocalStackTarget({
        stack: 'a',
        apiUrl: 'http://127.0.0.1:54321',
        dbUrl: 'postgres://postgres:postgres@127.0.0.1:54322/postgres',
      }).name,
    ).toBe('a');
    expect(
      assertLocalStackTarget({
        stack: 'b',
        apiUrl: 'http://127.0.0.1:25421',
        dbUrl: 'postgres://postgres:postgres@127.0.0.1:25422/postgres',
      }).name,
    ).toBe('b');
    expect(() =>
      assertLocalStackTarget({
        stack: 'b',
        apiUrl: 'https://project.supabase.co',
        dbUrl: 'postgres://postgres:postgres@127.0.0.1:25422/postgres',
      }),
    ).toThrow('Local Supabase target required');
    expect(() =>
      assertLocalStackTarget({
        stack: 'b',
        apiUrl: 'http://127.0.0.1:54321',
        dbUrl: 'postgres://postgres:postgres@127.0.0.1:54322/postgres',
      }),
    ).toThrow('Local Supabase target required');
  });

  it('uses the B config beside a shared migrations junction without copied migrations', () => {
    const config = readFileSync(
      'supabase-stack-b/supabase/config.toml',
      'utf8',
    );
    expect(config).toContain('project_id = "lifter-stack-b"');
    expect(config).toContain('stack = true');
    expect(config).toContain('port = 25421');
    expect(config).toContain('port = 25422');
  });
});

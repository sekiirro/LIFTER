import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertLocalStackTarget,
  getStackConfig,
  loadSelectedStackEnv,
  selectStack,
} from '../../scripts/local-stack.mjs';
import { localSupabaseContainer } from '../integration/local-docker';

describe('isolated local Supabase stack contract', () => {
  it('requires local selection and supports explicit A-D and CI profiles', () => {
    const ciEnv = { CI: 'true' } as Parameters<typeof selectStack>[0];
    const ciWithA = { ...ciEnv, LIFTER_SUPABASE_STACK: 'a' };

    expect(() => selectStack({})).toThrow(/Set LIFTER_SUPABASE_STACK/);
    expect(() => selectStack(ciEnv)).toThrow(/Set LIFTER_SUPABASE_STACK/);
    expect(selectStack(ciWithA)).toBe('a');
    expect(selectStack({ LIFTER_SUPABASE_STACK: 'a' })).toBe('a');
    expect(selectStack({ LIFTER_SUPABASE_STACK: 'b' })).toBe('b');
    expect(selectStack({ LIFTER_SUPABASE_STACK: 'c' })).toBe('c');
    expect(selectStack({ LIFTER_SUPABASE_STACK: 'd' })).toBe('d');
    expect(selectStack({ LIFTER_SUPABASE_STACK: 'ci' })).toBe('ci');
    expect(() => selectStack({ LIFTER_SUPABASE_STACK: '' })).toThrow(
      /Set LIFTER_SUPABASE_STACK/,
    );
    for (const invalid of ['remote', 'B', 'e']) {
      expect(() => selectStack({ LIFTER_SUPABASE_STACK: invalid })).toThrow(
        'Unsupported local Supabase stack',
      );
    }
  });

  it('requires an explicit selector even when endpoint variables are present', () => {
    expect(() =>
      selectStack({
        API_URL: 'http://127.0.0.1:25421',
        DB_URL: 'postgres://postgres:postgres@127.0.0.1:25422/postgres',
      }),
    ).toThrow(/Set LIFTER_SUPABASE_STACK/);
    expect(
      selectStack({
        LIFTER_SUPABASE_STACK: 'b',
        API_URL: 'http://127.0.0.1:25421',
        DB_URL: 'postgres://postgres:postgres@127.0.0.1:25422/postgres',
      }),
    ).toBe('b');
  });

  it('uses the supplied root for the explicitly selected profile', () => {
    const root = mkdtempSync(join(tmpdir(), 'lifter-stack-root-'));
    try {
      const b = join(root, 'supabase-stack-b', 'supabase');
      mkdirSync(b, { recursive: true });
      const config = getStackConfig('b')
        .configText.replaceAll('25421', '29521')
        .replaceAll('25422', '29522');
      writeFileSync(join(b, 'config.toml'), config);
      const env = {
        NODE_ENV: 'test' as const,
        LIFTER_SUPABASE_STACK: 'b',
        API_URL: 'http://127.0.0.1:29521',
        DB_URL: 'postgres://postgres:postgres@127.0.0.1:29522/postgres',
      };

      expect(loadSelectedStackEnv(env, root)).toBe('b');
      expect(selectStack(env)).toBe('b');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('isolates the CI profile from stacks A-D while validating its ports', () => {
    const root = mkdtempSync(join(tmpdir(), 'lifter-stack-ci-'));
    try {
      const supabase = join(root, 'supabase');
      mkdirSync(supabase, { recursive: true });
      const config = getStackConfig('a')
        .configText.replace(
          'project_id = "lifter"',
          'project_id = "lifter-stack-ci"',
        )
        .replace('54320', '55420')
        .replace('54321', '55421')
        .replace('54322', '55422')
        .replace('54323', '55423')
        .replace('54324', '55424')
        .replace('54325', '55425')
        .replace('54326', '55426')
        .replace('54327', '55427')
        .replace('54329', '55429')
        .replace('8083', '55428');
      writeFileSync(join(supabase, 'config.toml'), config);

      const ci = getStackConfig('ci', root);
      expect(ci.projectId).toBe('lifter-stack-ci');
      expect(ci.ports).toEqual([
        55421, 55422, 55420, 55423, 55424, 55425, 55426, 55427, 55428, 55429,
      ]);
      expect(
        assertLocalStackTarget({
          stack: 'ci',
          root,
          apiUrl: 'http://127.0.0.1:55421',
          dbUrl: 'postgres://postgres:postgres@127.0.0.1:55422/postgres',
        }).projectId,
      ).toBe('lifter-stack-ci');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('explains that missing C profiles must be provisioned in the lane worktree', () => {
    const root = mkdtempSync(join(tmpdir(), 'lifter-stack-c-missing-'));
    try {
      const expectedPath = join(
        root,
        'supabase-stack-c',
        'supabase',
        'config.toml',
      );
      expect(() => getStackConfig('c', root)).toThrow(
        /Expected profile config at .*supabase-stack-c.*config\.toml.*must be provisioned locally in the lane's worktree/,
      );
      expect(expectedPath).toContain('supabase-stack-c');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
    const root = mkdtempSync(join(tmpdir(), 'lifter-stack-container-'));
    try {
      const supabase = join(root, 'supabase');
      mkdirSync(supabase, { recursive: true });
      const config = getStackConfig('a')
        .configText.replace(
          'project_id = "lifter"',
          'project_id = "lifter-stack-ci"',
        )
        .replace('54320', '55420')
        .replace('54321', '55421')
        .replace('54322', '55422')
        .replace('54323', '55423')
        .replace('54324', '55424')
        .replace('54325', '55425')
        .replace('54326', '55426')
        .replace('54327', '55427')
        .replace('54329', '55429')
        .replace('8083', '55428');
      writeFileSync(join(supabase, 'config.toml'), config);

      process.env.LIFTER_SUPABASE_STACK = 'b';
      expect(localSupabaseContainer('db')).toBe('supabase_db_lifter-stack-b');
      process.env.LIFTER_SUPABASE_STACK = 'a';
      expect(localSupabaseContainer('auth')).toBe('supabase_auth_lifter');
      process.env.LIFTER_SUPABASE_STACK = 'ci';
      expect(localSupabaseContainer('db', root)).toBe(
        'supabase_db_lifter-stack-ci',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      if (previous === undefined) delete process.env.LIFTER_SUPABASE_STACK;
      else process.env.LIFTER_SUPABASE_STACK = previous;
    }
  });
});

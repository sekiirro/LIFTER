import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertLocalStackTarget,
  getStackConfig,
  selectStack,
} from '../../scripts/local-stack.mjs';

const temporaryRoots: string[] = [];

function stackRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'f13-stack-readiness-'));
  temporaryRoots.push(root);
  const profileDir = path.join(root, 'supabase-stack-c', 'supabase');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    path.join(profileDir, 'config.toml'),
    `project_id = "lifter-stack-c"\n\n[api]\nport = 35421\n\n[db]\nport = 35422\nshadow_port = 35420\n\n[studio]\nport = 35423\n\n[inbucket]\nport = 35424\nsmtp_port = 35425\npop3_port = 35426\n\n[analytics]\nport = 35427\n\n[edge_runtime]\ninspector_port = 35428\n\n[db.pooler]\nport = 35429\n`,
    'utf8',
  );
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('F13 isolated Stack C contract', () => {
  it('selects only Stack C when explicitly requested', () => {
    expect(selectStack({ LIFTER_SUPABASE_STACK: 'c' })).toBe('c');
    expect(selectStack({ LIFTER_SUPABASE_STACK: 'd' })).toBe('d');
    for (const invalid of ['C', 'remote']) {
      expect(() => selectStack({ LIFTER_SUPABASE_STACK: invalid })).toThrow(
        'Unsupported local Supabase stack',
      );
    }
  });

  it('requires an explicit stack selector alongside generic CI endpoint variables', () => {
    expect(() =>
      selectStack({
        API_URL: 'http://127.0.0.1:35421',
        DB_URL: 'postgres://postgres:postgres@127.0.0.1:35422/postgres',
      }),
    ).toThrow('No local Supabase stack selected');
    expect(
      selectStack({
        LIFTER_SUPABASE_STACK: 'c',
        API_URL: 'http://127.0.0.1:35421',
        DB_URL: 'postgres://postgres:postgres@127.0.0.1:35422/postgres',
      }),
    ).toBe('c');
  });

  it('binds Stack C to its own project and full distinct port block', () => {
    const config = getStackConfig('c', stackRoot());
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
        assertLocalStackTarget({
          stack: 'c',
          apiUrl,
          dbUrl,
          root: stackRoot(),
        }),
      ).toThrow('Local Supabase target required');
    }
  });

  it('accepts only the Stack C loopback API and database endpoints', () => {
    expect(
      assertLocalStackTarget({
        stack: 'c',
        apiUrl: 'http://127.0.0.1:35421',
        dbUrl: 'postgres://postgres:postgres@127.0.0.1:35422/postgres',
        root: stackRoot(),
      }).projectId,
    ).toBe('lifter-stack-c');
  });
});

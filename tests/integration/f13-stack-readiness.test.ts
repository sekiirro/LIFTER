import { readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { getStackConfig, selectStack } from '../../scripts/local-stack.mjs';
import { loadEnv, sql } from './harness';

const stack = selectStack(process.env);
const target = loadEnv();
const config = getStackConfig(stack);
const db = sql();

afterAll(() => db.end());

it(`has the selected project identity, API/DB ports, and complete migration baseline (${stack})`, async () => {
  expect(config.name).toBe(stack);
  expect(target.apiUrl).toBe(`http://127.0.0.1:${config.apiPort}`);
  const dbUrl = new URL(target.dbUrl);
  expect(dbUrl.hostname).toBe('127.0.0.1');
  expect(dbUrl.port).toBe(String(config.dbPort));
  expect(dbUrl.pathname).toBe('/postgres');

  if (stack === 'c') {
    expect(config.projectId).toBe('lifter-stack-c');
    expect(config.apiPort).toBe(35421);
    expect(config.dbPort).toBe(35422);
    expect(config.workdir.endsWith('supabase-stack-c')).toBe(true);
  }

  const expected = readdirSync(
    path.join(process.cwd(), 'supabase', 'migrations'),
  )
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .map((name) => name.slice(0, 14))
    .sort();
  const applied = await db`
    select version from supabase_migrations.schema_migrations order by version
  `;
  expect(applied.map((row) => row.version)).toEqual(expected);
});

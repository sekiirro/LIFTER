import { readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { getStackConfig, selectStack } from '../../scripts/local-stack.mjs';
import { loadEnv, sql } from './harness';

if (selectStack(process.env) !== 'c') {
  throw new Error('F13 integration suite requires LIFTER_SUPABASE_STACK=c');
}

const target = loadEnv();
const config = getStackConfig('c');
const db = sql();

afterAll(() => db.end());

it('has the F13 project identity, API/DB ports, and complete branch migration baseline', async () => {
  expect(config.projectId).toBe('lifter-stack-c');
  expect(target.apiUrl).toBe('http://127.0.0.1:35421');
  const dbUrl = new URL(target.dbUrl);
  expect(dbUrl.hostname).toBe('127.0.0.1');
  expect(dbUrl.port).toBe('35422');
  expect(dbUrl.pathname).toBe('/postgres');

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

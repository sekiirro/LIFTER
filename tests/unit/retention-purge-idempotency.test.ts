import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/20261223100100_retention_purge_apply.sql',
    import.meta.url,
  ),
  'utf8',
);

it('binds each completed purge result to a unique run id and replays it', () => {
  expect(migration).toMatch(
    /create\s+table\s+app_private\.retention_purge_runs[\s\S]*?run_id\s+uuid\s+primary\s+key/i,
  );
  expect(migration).toMatch(/request_fingerprint\s+text\s+not\s+null/i);
  expect(migration).toMatch(/'status',\s*'replayed'/i);
  expect(migration).toMatch(/retention_purge_run_conflict/i);
  expect(migration).toMatch(
    /insert\s+into\s+app_private\.retention_purge_runs/i,
  );
});

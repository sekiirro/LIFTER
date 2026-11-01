import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { admin, sql } from './harness';

const db = sql();
const contract = readFileSync(
  resolve(process.cwd(), 'specs/016-exercise-food-catalogs/contracts/catalog-api.md'),
  'utf8',
);
const roleParity = JSON.parse(readFileSync(
  resolve(process.cwd(), 'tests/fixtures/catalog-role-parity.sql.json'),
  'utf8',
)) as { operations: Array<Record<string, string> & { operation: string }> };

afterAll(async () => db.end());

describe('shared catalog operation key ledger', () => {
  it('uses the T001 role-parity fixture as the caller authorization source', () => {
    const createFood = roleParity.operations.find(
      (row) => row.operation === 'Create global food',
    );
    expect(createFood).toBeDefined();
    expect(createFood?.PO).toMatch(/^Allow/);
    expect(createFood?.WO).toMatch(/^Allow/);
    expect(createFood?.Trainer).toMatch(/^Allow/);
    expect(createFood?.Sales).toBe('Deny');
    expect(createFood?.Client).toBe('Deny');
    expect(createFood?.['Unknown/unauthenticated']).toBe('Deny');
  });

  it('stores one action-bound request and response per actor UUIDv4 key', async () => {
    const columns = await db`
      select column_name, is_nullable, data_type
      from information_schema.columns
      where table_schema = 'app_private' and table_name = 'operation_keys'
      order by ordinal_position
    `;
    expect(columns.map((column) => column.column_name)).toEqual([
      'actor_user_id', 'action', 'operation_key', 'request_hash', 'result', 'created_at',
    ]);
    expect(columns.filter((column) => column.column_name !== 'result')
      .every((column) => column.is_nullable === 'NO')).toBe(true);
    expect(columns.find((column) => column.column_name === 'result')?.is_nullable).toBe('YES');

    const constraints = await db`
      select conname, pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conrelid = 'app_private.operation_keys'::regclass
    `;
    expect(constraints.some((constraint) =>
      constraint.definition.includes('PRIMARY KEY (actor_user_id, operation_key)')),
    ).toBe(true);
    expect(constraints.some((constraint) =>
      constraint.definition.includes('action') && constraint.definition.includes('operation_key'),
    )).toBe(false);

    const created = await admin().auth.admin.createUser({
      email: `catalog-operation-key-${randomUUID()}@example.test`,
      password: `Catalog-${randomUUID()}-aA1!`,
      email_confirm: true,
    });
    if (created.error || !created.data.user)
      throw new Error(created.error?.message ?? 'operation key actor missing');
    const actor = created.data.user.id;
    const key = randomUUID();
    const requestHash = `sha256:${'a'.repeat(64)}`;
    const original = { food_id: randomUUID(), version: 1 };
    try {
      await db`
        insert into app_private.operation_keys(actor_user_id, action, operation_key, request_hash, result)
        values (${actor}, 'catalog.food_created', ${key}, ${requestHash}, ${db.json(original)})
      `;
      const replay = await db`
        select app_private.operation_key_result(${actor}, 'catalog.food_created', ${key}, ${requestHash}) as result
      `;
      expect(replay[0]?.result).toEqual(original);
      await expect(db`
        select app_private.operation_key_result(${actor}, 'catalog.food_versioned', ${key}, ${requestHash})
      `).rejects.toThrow('operation_key_request_conflict');
      await expect(db`
        select app_private.operation_key_result(${actor}, 'catalog.food_created', ${key}, ${`sha256:${'b'.repeat(64)}`})
      `).rejects.toThrow('operation_key_request_conflict');
    } finally {
      await admin().auth.admin.deleteUser(actor);
    }
  });

  it('exposes the shared 30-day replay contract and cron purge', async () => {
    const policy = await db`select app_private.operation_key_retention_days() as days`;
    expect(policy[0]?.days).toBe(30);
    const source = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261106100000_catalog_operation_keys.sql'),
      'utf8',
    );
    expect(source).toContain('operation_key_request_conflict');
    expect(source).toContain('lifter-f11-purge-signup');
    expect(source).toContain('purge_operation_keys');
  });

  it('keeps the F16 audit mapping two-segment, allowlisted and globally unscoped', async () => {
    expect(contract).toContain('## Audit action contract');
    expect(contract).toContain('Global `workspace_id` is NULL');
    expect(contract).toContain('changed-field values are codes from the writer\'s fixed allowlist');
    expect(contract).not.toMatch(/raw operation key[^\n]*audit/i);

    const target = randomUUID();
    const rows = await db`
      select app_private.catalog_write_audit(
        ${randomUUID()}, 'catalog.food_created', 'foods', ${target}, null,
        '{"identity_id":"00000000-0000-4000-8000-000000000001","version":1,"changed_fields":["name_en"]}'::jsonb
      ) as event_id
    `;
    const [event] = await db`select action, target_table, target_id, workspace_id, details
      from public.audit_events where id = ${rows[0]?.event_id}`;
    expect(event?.action).toMatch(/^[a-z_]+\.[a-z_]+$/);
    expect(event?.target_table).toBe('foods');
    expect(event?.target_id).toBe(target);
    expect(event?.workspace_id).toBeNull();
    expect(event?.details.changed_fields).toEqual(['name_en']);
    await expect(db`
      select app_private.catalog_write_audit(
        null, 'catalog.food_created', 'foods', ${randomUUID()}, null,
        '{"name":"must not be audited","operation_key":"raw"}'::jsonb
      )
    `).rejects.toThrow('catalog_audit_contract_violation');
  });
});

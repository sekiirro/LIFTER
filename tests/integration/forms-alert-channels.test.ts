import {
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql, TransactionSql } from 'postgres';
import { afterAll, expect, it } from 'vitest';
import { sql } from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());
const rollback = new Error('rollback T054 channel mutation');
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const authenticatedFunctions = new Set([
  'create_f15_telegram_link_token',
  'mark_form_alert_read',
  'read_form_alert_inbox',
  'unlink_f15_telegram',
]);
const serviceFunctions = new Set([
  'claim_f15_form_alert_jobs',
  'claim_f15_telegram_delivery',
  'consume_f15_telegram_start',
  'finish_f15_telegram_delivery',
  'prepare_f15_telegram_delivery',
]);

async function assertAlertFunctionAcl(connection: Sql | TransactionSql = db) {
  const functions = await connection`
    select n.nspname as schema_name,p.proname,p.proconfig,
      pg_catalog.pg_get_userbyid(p.proowner) as owner,
      has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_exec,
      has_function_privilege('service_role',p.oid,'EXECUTE') as service_exec
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('app_private','public')
      and (
        (n.nspname='app_private' and (p.proname ilike '%alert%' or p.proname ilike '%telegram%'))
        or (n.nspname='public' and p.proname in (
          'create_f15_telegram_link_token','mark_form_alert_read','read_form_alert_inbox',
          'unlink_f15_telegram','claim_f15_form_alert_jobs','claim_f15_telegram_delivery',
          'consume_f15_telegram_start','finish_f15_telegram_delivery','prepare_f15_telegram_delivery'
        ))
      )
    order by n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid)
  `;
  expect(functions.length).toBeGreaterThan(10);
  const observed = new Set(
    functions.map((fn) => `${fn.schema_name}.${fn.proname}`),
  );
  for (const name of [
    'app_private.evaluate_forms_alerts_core',
    'app_private.write_f15_in_app_alert',
    'public.create_f15_telegram_link_token',
    'public.read_form_alert_inbox',
    'public.prepare_f15_telegram_delivery',
    'public.claim_f15_telegram_delivery',
    'public.claim_f15_form_alert_jobs',
    'public.consume_f15_telegram_start',
    'public.finish_f15_telegram_delivery',
  ])
    expect(observed.has(name), `${name} catalogued`).toBe(true);

  for (const fn of functions) {
    expect(fn.owner, `${fn.schema_name}.${fn.proname} owner`).toBe('postgres');
    expect(
      fn.proconfig,
      `${fn.schema_name}.${fn.proname} search_path`,
    ).toContain('search_path=""');
    expect(fn.anon_exec, `${fn.schema_name}.${fn.proname} anon`).toBe(false);
    expect(
      fn.authenticated_exec,
      `${fn.schema_name}.${fn.proname} authenticated`,
    ).toBe(
      fn.schema_name === 'public' && authenticatedFunctions.has(fn.proname),
    );
    expect(
      fn.service_exec,
      `${fn.schema_name}.${fn.proname} service_role`,
    ).toBe(fn.schema_name === 'public' && serviceFunctions.has(fn.proname));
  }
}

function walkFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

function assertNoFormsEmailAdapter() {
  const paths = [
    ...walkFiles(join(repoRoot, 'app/api/forms')),
    ...walkFiles(join(repoRoot, 'lib/forms')),
  ].map((path) => relative(repoRoot, path).replaceAll('\\', '/'));
  expect(paths.filter((path) => /(?:email|mail)/i.test(path))).toEqual([]);

  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, 'package.json'), 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const packages = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  expect(
    Object.keys(packages).filter((name) =>
      /^(?:nodemailer|resend|postmark|@sendgrid\/|mailgun)/i.test(name),
    ),
  ).toEqual([]);
}

it('catalogs unique per-channel delivery, forced RLS, and alert RPC ACLs', async () => {
  const [unique] = await db`
    select pg_catalog.pg_get_constraintdef(oid) as definition
    from pg_catalog.pg_constraint
    where conrelid='app_private.form_alert_deliveries'::regclass
      and contype='u'
      and pg_catalog.pg_get_constraintdef(oid) like 'UNIQUE (workspace_id, alert_occurrence_id,%'
  `;
  expect(unique?.definition).toBe(
    'UNIQUE (workspace_id, alert_occurrence_id, stage, recipient_user_id, channel)',
  );

  const protectedTables = [
    'form_alert_deliveries',
    'form_alert_inbox',
    'f15_telegram_link_tokens',
    'f15_telegram_links',
    'f15_telegram_webhook_updates',
  ];
  const tables = await db`
    select c.relname,c.relrowsecurity,c.relforcerowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='app_private' and c.relname::text=any(${protectedTables}::text[])
    order by c.relname
  `;
  expect(tables.map((table) => table.relname).sort()).toEqual(
    [...protectedTables].sort(),
  );
  for (const table of tables)
    expect(table).toMatchObject({
      relrowsecurity: true,
      relforcerowsecurity: true,
    });

  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const table of protectedTables) {
      const [privileges] = await db`
        select has_table_privilege(${role},${`app_private.${table}`},'SELECT') as can_read,
          has_table_privilege(${role},${`app_private.${table}`},'INSERT') as can_insert,
          has_table_privilege(${role},${`app_private.${table}`},'UPDATE') as can_update,
          has_table_privilege(${role},${`app_private.${table}`},'DELETE') as can_delete
      `;
      expect(privileges, `${role} on ${table}`).toEqual({
        can_read: false,
        can_insert: false,
        can_update: false,
        can_delete: false,
      });
    }
  }

  const policies = await db`
    select policyname,roles,cmd
    from pg_catalog.pg_policies
    where schemaname='app_private' and tablename='form_alert_inbox'
  `;
  expect(policies).toEqual([
    {
      policyname: 'form_alert_inbox_recipient_only',
      roles: ['authenticated'],
      cmd: 'SELECT',
    },
  ]);
  await assertAlertFunctionAcl();
});

it('kills a new F15 function grant to anon or authenticated', async () => {
  let mutationFailure: unknown;
  try {
    await db.begin(async (tx) => {
      await tx.unsafe(`
        create function app_private.f15_alert_acl_mutant() returns boolean
        language sql security definer set search_path='' as $$ select true $$;
        revoke all on function app_private.f15_alert_acl_mutant() from public,anon,authenticated,service_role;
        grant execute on function app_private.f15_alert_acl_mutant() to anon,authenticated;
      `);
      try {
        await assertAlertFunctionAcl(tx);
      } catch (error) {
        mutationFailure = error;
      }
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback && mutationFailure === undefined)
      mutationFailure = error;
  }
  expect(
    mutationFailure,
    'ACL mutant must fail the catalog assertion',
  ).toBeDefined();
});

it('proves there is no email route, provider, or adapter and kills an adapter mutant', () => {
  const mutantPath = join(repoRoot, 'lib/forms/email-adapter.mutation.ts');
  expect(existsSync(mutantPath)).toBe(false);
  assertNoFormsEmailAdapter();
  try {
    writeFileSync(mutantPath, 'export const sendEmail = () => undefined;\n', {
      encoding: 'utf8',
      flag: 'wx',
    });
    expect(() => assertNoFormsEmailAdapter()).toThrow();
  } finally {
    if (existsSync(mutantPath)) unlinkSync(mutantPath);
  }
  expect(existsSync(mutantPath)).toBe(false);
  assertNoFormsEmailAdapter();
});

it('keeps the F15 alert scheduler disabled after migration replay', async () => {
  const [active] = await db`
    select count(*)::int as jobs from cron.job where jobname='lifter-f15-alerts'
  `;
  expect(active?.jobs).toBe(0);

  const migrationFiles = walkFiles(
    join(repoRoot, 'supabase/migrations'),
  ).filter((path) =>
    /^(?:2026110403|2026110823)\d{4}_f15_.*\.sql$/.test(
      path.split(/[\\/]/).at(-1) ?? '',
    ),
  );
  expect(migrationFiles.length).toBeGreaterThan(0);
  const migrations = migrationFiles.map((path) => readFileSync(path, 'utf8'));
  const assertNoActivation = (sources: string[]) => {
    for (const source of sources)
      expect(source).not.toMatch(
        /^\s*select\s+app_private\.f15_alert_schedule_activate\s*\(/im,
      );
  };
  assertNoActivation(migrations);

  const mutant = migrations[0]!.replace(
    '-- S25-PO-8: keep scheduler disabled until separately approved.',
    '-- S25-PO-8: keep scheduler disabled until separately approved.\nselect app_private.f15_alert_schedule_activate();',
  );
  const activationMutant =
    mutant === migrations[0]
      ? `${migrations[0]}\nselect app_private.f15_alert_schedule_activate();`
      : mutant;
  expect(() => assertNoActivation([activationMutant])).toThrow();
  assertNoActivation(migrations);
});

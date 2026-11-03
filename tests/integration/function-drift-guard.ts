import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { loadEnv } from './harness';

export const guardedFunctions = [
  {
    identity:
      'app_private.evaluate_forms_alerts_core(timestamptz,uuid,integer)',
    migration: '20261107004000_f15_alert_candidate_filter.sql',
    name: 'app_private.evaluate_forms_alerts_core',
  },
  {
    identity: 'app_private.f15_alert_schedule_immutable()',
    migration: '20261104030800_f15_alert_schedules.sql',
    name: 'app_private.f15_alert_schedule_immutable',
  },
  {
    identity: 'app_private.f15_alert_schedule_activate()',
    migration: '20261104030800_f15_alert_schedules.sql',
    name: 'app_private.f15_alert_schedule_activate',
  },
  {
    identity: 'app_private.f15_alert_schedule_deactivate()',
    migration: '20261104030800_f15_alert_schedules.sql',
    name: 'app_private.f15_alert_schedule_deactivate',
  },
  {
    identity: 'app_private.branding_publish(uuid,bigint)',
    migration: '20261102152000_branding_shared_asset_retention.sql',
    name: 'app_private.branding_publish',
    owner: 'branding_definer',
  },
  {
    identity: 'app_private.branding_asset_attach(uuid,bigint)',
    migration:
      '20261102132900_workspace_branding_gc_reference_serialization.sql',
    name: 'app_private.branding_asset_attach',
    owner: 'branding_definer',
  },
  {
    identity: 'app_private.branding_gc_finalize(uuid)',
    migration: '20261102134000_branding_upload_recovery.sql',
    name: 'app_private.branding_gc_finalize',
    owner: 'branding_definer',
  },
] as const;

function hash(value: string) {
  return createHash('md5').update(value).digest('hex');
}

async function migrationDefinition(
  migration: (typeof guardedFunctions)[number]['migration'],
  name: string,
) {
  const sql = await readFile(`supabase/migrations/${migration}`, 'utf8');
  const escapedName = name.replaceAll('.', '\\.');
  const expression = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+${escapedName}\\s*\\([\\s\\S]*?\\)\\s*[\\s\\S]*?\\bas\\s+\\$\\$[\\s\\S]*?\\$\\$\\s*;`,
    'gi',
  );
  const matches = [...sql.matchAll(expression)];
  const definition = matches.at(-1)?.[0];
  if (!definition) throw new Error(`missing migration function ${name}`);
  const body = definition.match(/\bas\s+\$\$([\s\S]*?)\$\$/i)?.[1];
  if (body === undefined) throw new Error(`missing migration body ${name}`);
  return {
    definition: definition.replace(
      /^create\s+function\s+/i,
      'create or replace function ',
    ),
    bodyHash: hash(body),
  };
}

export async function applyFunctionDefinition(
  db: postgres.Sql,
  owner: string,
  definition: string,
) {
  if (owner !== 'branding_definer') {
    await db.unsafe(definition);
    return;
  }
  await db`grant create on schema app_private to branding_definer`;
  await db`grant branding_definer to postgres`;
  try {
    await db.begin(async (tx) => {
      await tx`set local role branding_definer`;
      await tx.unsafe(definition);
    });
  } finally {
    await db`revoke branding_definer from postgres`;
    await db`revoke create on schema app_private from branding_definer`;
  }
}

export async function checkAndRestoreFunctionDrift() {
  const { dbUrl } = loadEnv();
  const db = postgres(dbUrl, { max: 1, connect_timeout: 10 });
  const drift: string[] = [];
  try {
    for (const item of guardedFunctions) {
      const expected = await migrationDefinition(item.migration, item.name);
      const [actual] = await db<{ body_hash: string; definition: string }[]>`
        select md5(p.prosrc) as body_hash,
          pg_get_functiondef(p.oid) as definition
        from pg_proc p where p.oid = ${item.identity}::regprocedure
      `;
      if (!actual) throw new Error(`missing guarded function ${item.identity}`);
      if (actual.body_hash === expected.bodyHash) continue;
      drift.push(item.identity);
      await applyFunctionDefinition(
        db,
        'owner' in item ? item.owner : 'postgres',
        expected.definition,
      );
      const [restored] = await db<{ body_hash: string }[]>`
        select md5(p.prosrc) as body_hash
        from pg_proc p where p.oid = ${item.identity}::regprocedure
      `;
      if (restored?.body_hash !== expected.bodyHash)
        throw new Error(
          `failed restoring migration definition for ${item.identity}`,
        );
    }
  } finally {
    await db.end();
  }
  if (drift.length)
    throw new Error(
      `F15 function drift detected and restored from migrations: ${drift.join(', ')}`,
    );
}

export default async function functionDriftGuard() {
  await checkAndRestoreFunctionDrift();
  return async () => checkAndRestoreFunctionDrift();
}

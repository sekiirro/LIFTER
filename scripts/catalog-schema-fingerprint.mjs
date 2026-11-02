import { createHash } from 'node:crypto';
import postgres from 'postgres';

const databaseUrl = process.env.DB_URL || process.env.SUPABASE_DB_URL;
if (!databaseUrl) throw new Error('Stack-injected DB_URL is required');
const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
try {
  const relations = await sql`
    select n.nspname as schema_name, c.relname as relation_name, c.relkind,
      a.attnum, a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
      a.attnotnull, pg_catalog.pg_get_expr(d.adbin, d.adrelid) as default_expr,
      a.attgenerated, a.attidentity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    left join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_catalog.pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
    where n.nspname in ('public', 'app_private') and c.relkind in ('r','p','v','m','f')
    order by 1, 2, 4
  `;
  const constraints = await sql`
    select n.nspname as schema_name, c.relname as relation_name, con.conname,
      con.contype, pg_catalog.pg_get_constraintdef(con.oid, true) as definition
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'app_private') order by 1, 2, 3
  `;
  const routines = await sql`
    select n.nspname as schema_name, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
      pg_catalog.pg_get_function_result(p.oid) as result, l.lanname, p.prokind,
      p.prosecdef, p.provolatile, p.proconfig, pg_catalog.pg_get_functiondef(p.oid) as definition
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_language l on l.oid = p.prolang
    where n.nspname in ('public', 'app_private') order by 1, 2, 3
  `;
  const policies = await sql`
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_catalog.pg_policies where schemaname in ('public', 'app_private')
    order by 1, 2, 3
  `;
  const indexes = await sql`
    select schemaname, tablename, indexname, indexdef from pg_catalog.pg_indexes
    where schemaname in ('public', 'app_private') order by 1, 2, 3
  `;
  const migrationCount = await sql`
    select count(*)::integer as count from supabase_migrations.schema_migrations
  `;
  const payload = JSON.stringify({
    relations,
    constraints,
    routines,
    policies,
    indexes,
  });
  process.stdout.write(
    JSON.stringify({
      sha256: createHash('sha256').update(payload).digest('hex'),
      relations: relations.length,
      constraints: constraints.length,
      routines: routines.length,
      policies: policies.length,
      indexes: indexes.length,
      appliedMigrations: migrationCount[0]?.count ?? 0,
    }) + '\n',
  );
} finally {
  await sql.end();
}

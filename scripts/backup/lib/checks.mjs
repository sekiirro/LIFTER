/** All ordinary/partition-root application tables, plus the portable auth.users id check. */
export async function collectChecks(sql) {
  const tables = await sql`select n.nspname as schema, c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and not c.relispartition and (
      (n.nspname !~ '^(pg_|supabase_|graphql|pgsodium)' and n.nspname not in
      ('information_schema','auth','storage','realtime','extensions','vault','net','cron','_realtime','_analytics','_supabase','_supavisor'))
      or (n.nspname = 'auth' and c.relname = 'users')) order by 1, 2`;
  const checks = {};
  // Fixed session formatting makes row text stable across operator locales/timezones.
  await sql`set timezone = 'UTC'`;
  await sql`set datestyle = 'ISO, YMD'`;
  await sql`set intervalstyle = 'postgres'`;
  await sql`set extra_float_digits = 3`;
  for (const table of tables) {
    const expression = table.schema === 'auth' ? sql`id::text` : sql`t::text`;
    const [row] = await sql`select count(*)::text as count,
      md5(coalesce(string_agg(md5(${expression}), '' order by md5(${expression})), '')) as checksum
      from ${sql.unsafe(`"${table.schema.replaceAll('"', '""')}"."${table.name.replaceAll('"', '""')}"`)} t`;
    checks[`${table.schema}.${table.name}`] = {
      count: row.count,
      checksum: row.checksum,
    };
  }
  return checks;
}
export function compareChecks(expected, actual) {
  const mismatches = [
    ...new Set([...Object.keys(expected), ...Object.keys(actual)]),
  ]
    .sort()
    .filter(
      (key) =>
        !expected[key] ||
        !actual[key] ||
        expected[key].count !== actual[key].count ||
        expected[key].checksum !== actual[key].checksum,
    );
  return { ok: mismatches.length === 0, mismatches };
}

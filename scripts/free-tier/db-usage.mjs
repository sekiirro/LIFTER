import postgres from 'postgres';
import { parseArgs } from '../backup/lib/args.mjs';
import { redact } from '../backup/lib/redact.mjs';
import { isMain, output, positive } from './lib/cli.mjs';
import { usageReport } from './lib/usage.mjs';

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv, ['count', 'limit-mb', 'json']);
  const limitMb = positive(args['limit-mb'], 500);
  const names = args.count === undefined ? [] : args.count.split(',');
  if (names.some((name) => !/^[a-z_]+\.[a-z_]+$/.test(name)))
    throw new Error('Invalid count allow-list');
  if (!process.env.FREE_TIER_DB_URL)
    throw new Error('FREE_TIER_DB_URL is required');
  const sql = postgres(process.env.FREE_TIER_DB_URL, {
    max: 1,
    onnotice: () => {},
    onparameter: () => {},
  });
  try {
    const report = await sql.begin('read only', async (tx) => {
      await tx`set transaction read only`;
      await tx`set local statement_timeout = '15s'`;
      const [database] =
        await tx`select pg_database_size(current_database()) as bytes`;
      const rows = await tx`
        select n.nspname || '.' || c.relname as table,
          pg_total_relation_size(c.oid) as total_bytes, c.reltuples
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public', 'auth', 'app_private') and c.relkind in ('r', 'm', 'p')
        order by pg_total_relation_size(c.oid) desc limit 15`;
      const counts = {};
      for (const name of new Set(names)) {
        const [schema, table] = name.split('.');
        const exists =
          await tx`select 1 from pg_tables where schemaname = ${schema} and tablename = ${table}`;
        if (!exists.length) throw new Error('Count table does not exist');
        const [row] = await tx`select count(*) as count from ${tx(name)}`;
        counts[name] = row.count;
      }
      return usageReport(database.bytes, rows, counts, limitMb);
    });
    console.table(report.tables);
    console.log(
      `Database: ${report.total_bytes} bytes / ${report.limit_bytes} bytes (${report.pct.toFixed(2)}%, ${report.verdict})`,
    );
    await output(report, args.json);
  } finally {
    await sql.end();
  }
}

if (isMain(import.meta.url))
  main().catch(() => {
    console.error(
      redact(
        'Database usage failed; check FREE_TIER_DB_URL, arguments and database availability',
      ),
    );
    process.exitCode = 1;
  });

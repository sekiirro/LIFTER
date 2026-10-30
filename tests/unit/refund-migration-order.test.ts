import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const migrationsDirectory = join(process.cwd(), 'supabase', 'migrations');
const guardedFunction =
  /create\s+or\s+replace\s+function\s+public\.subscription_payment_status\b[\s\S]*?\bas\s+\$\$([\s\S]*?)\$\$\s*;/gi;

it('preserves unpaid=false in every later subscription payment status definition', () => {
  const laterMigrations = readdirSync(migrationsDirectory)
    .filter((filename) => /^\d{14}_.*\.sql$/.test(filename))
    .filter((filename) => filename.slice(0, 14) > '20261103127900')
    .sort();

  for (const filename of laterMigrations) {
    const sql = readFileSync(join(migrationsDirectory, filename), 'utf8');
    for (const match of sql.matchAll(guardedFunction)) {
      expect(match[1], filename).toMatch(
        /'paid'\s*,\s*coalesce\s*\(\s*t\.kind\s*=\s*'collection'\s*,\s*false\s*\)/i,
      );
    }
  }
});

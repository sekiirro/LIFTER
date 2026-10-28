/**
 * Regenerate only the delimited constants in the forward migration. Unicode
 * version changes require a new forward migration, never rewriting applied SQL.
 * Node 24 currently uses Unicode 17.0. CI's --check intentionally fails if the
 * runtime category data changes. These are the shared validator's expressions;
 * no normalization, POSIX classes, ICU or database locale enters the result.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'supabase/migrations/20261031123000_signup_password_parity.sql';
function ranges(pattern) {
  const result = [];
  let start;
  for (let cp = 0; cp <= 0x110000; cp++) {
    const matches = cp < 0x110000 && pattern.test(String.fromCodePoint(cp));
    if (matches && start === undefined) start = cp;
    if (!matches && start !== undefined) {
      result.push(`[${start},${cp})`);
      start = undefined;
    }
  }
  return `'{${result.join(',')}}'::pg_catalog.int4multirange`;
}

const constants = `-- BEGIN GENERATED UNICODE RANGES
  -- Unicode ${process.versions.unicode}; all U+0000..U+10FFFF, half-open integer ranges.
  digit_ranges constant pg_catalog.int4multirange := ${ranges(/\p{Nd}/u)};
  symbol_ranges constant pg_catalog.int4multirange := ${ranges(/[^\p{L}\p{Nd}\p{Z}\p{C}\s]/u)};
  -- END GENERATED UNICODE RANGES`;
const sql = readFileSync(path, 'utf8');
const generated = sql.replace(
  /-- BEGIN GENERATED UNICODE RANGES[\s\S]*?-- END GENERATED UNICODE RANGES/,
  constants,
);
if (!sql.includes('-- BEGIN GENERATED UNICODE RANGES')) {
  throw new Error('Unicode range markers missing');
}
if (process.argv.includes('--check')) {
  if (sql !== generated)
    throw new Error(
      'DB Unicode ranges differ from runtime validator categories',
    );
} else {
  writeFileSync(path, generated);
}

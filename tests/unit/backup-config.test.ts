import { expect, it } from 'vitest';
import { restoreConfig } from '../../scripts/backup/lib/config.mjs';
import { timeoutOptions, UsageError } from '../../scripts/backup/lib/args.mjs';

it('converts the optional CLI timeout to milliseconds and rejects invalid durations', () => {
  expect(timeoutOptions()).toEqual({});
  expect(timeoutOptions('30')).toEqual({ timeoutMs: 1800000 });
  expect(timeoutOptions('0.001')).toEqual({ timeoutMs: 60 });
  for (const value of ['0', '-1', 'NaN', 'Infinity', '99999999'])
    expect(() => timeoutOptions(value)).toThrow(UsageError);
});

it('overrides existing sections without duplicate TOML tables', () => {
  const output = restoreConfig(
    'project_id = "lifter"\n[api]\nport = 54321\nschemas = ["public"]\n[db]\nport = 54322\nshadow_port = 54320\n',
  );
  expect(output).toContain('project_id = "lifter-restore"');
  expect(output).toContain('schemas = ["public"]');
  for (const section of [
    'api',
    'db',
    'studio',
    'inbucket',
    'local_smtp',
    'analytics',
    'db.pooler',
  ])
    expect(output.split(`[${section}]`)).toHaveLength(2);
  for (const port of [55321, 55322, 55320, 55323, 55324, 55327, 55329])
    expect(output).toContain(`= ${port}`);
  expect(output).not.toContain('5432');
});

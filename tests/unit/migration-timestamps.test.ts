import { describe, expect, it } from 'vitest';
import {
  ALLOWED_MERGED_TIMESTAMP_EXCEPTIONS,
  validateMigrationFilenames,
} from '../../scripts/check-migration-timestamps.mjs';

describe('migration timestamp validation', () => {
  it('accepts a valid UTC migration version', () => {
    expect(
      validateMigrationFilenames(['20261106115100_catalog_change.sql']),
    ).toEqual([]);
  });

  it('rejects an unapproved 116000-style invalid time', () => {
    expect(
      validateMigrationFilenames(['20261106116000_catalog_change.sql']),
    ).toContain(
      '20261106116000_catalog_change.sql: invalid UTC migration timestamp 20261106116000',
    );
  });

  it('permits an exact merged exception from S25-PO-7', () => {
    expect(ALLOWED_MERGED_TIMESTAMP_EXCEPTIONS.size).toBe(11);
    expect(
      validateMigrationFilenames(['20261102136000_merged_migration.sql']),
    ).toEqual([]);
  });

  it('rejects duplicate versions even when filenames differ', () => {
    expect(
      validateMigrationFilenames([
        '20261106115100_catalog_change.sql',
        '20261106115100_other_change.sql',
      ]),
    ).toContain(
      '20261106115100_other_change.sql: duplicate version 20261106115100',
    );
  });

  it('rejects a newly added invalid migration filename', () => {
    expect(
      validateMigrationFilenames(['20261106118000_new_invalid_migration.sql']),
    ).toContain(
      '20261106118000_new_invalid_migration.sql: invalid UTC migration timestamp 20261106118000',
    );
  });
});

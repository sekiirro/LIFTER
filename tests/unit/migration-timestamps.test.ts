import { describe, expect, it } from 'vitest';
import {
  ALLOWED_MERGED_TIMESTAMP_EXCEPTIONS,
  checkRemoteRefs,
  findCrossRefVersionConflicts,
  parseMigrationTreeOutput,
  parseOriginRemoteRefs,
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

describe('remote-ref parsing helpers', () => {
  it('excludes only refs/remotes/origin/HEAD and keeps other refs ending in /HEAD', () => {
    const refs = parseOriginRemoteRefs(
      [
        'refs/remotes/origin/HEAD',
        'refs/remotes/origin/main',
        'refs/remotes/origin/feature/HEAD',
        'refs/remotes/origin/015-forms-intake',
        '',
      ].join('\n'),
    );
    expect(refs).toEqual([
      'refs/remotes/origin/main',
      'refs/remotes/origin/feature/HEAD',
      'refs/remotes/origin/015-forms-intake',
    ]);
  });

  it('parses NUL-delimited ls-tree output without dropping non-ASCII filenames', () => {
    const tree =
      [
        'supabase/migrations/20261107030000_catalog_workspace_exercise_remove.sql',
        'supabase/migrations/20261108040000_catalógo_niño.sql',
        'supabase/migrations/20261109050000_notes_ü.txt',
      ].join('\0') + '\0';
    expect(parseMigrationTreeOutput(tree)).toEqual([
      '20261107030000_catalog_workspace_exercise_remove.sql',
      '20261108040000_catalógo_niño.sql',
    ]);
  });

  it('returns an empty list for empty ls-tree output', () => {
    expect(parseMigrationTreeOutput('')).toEqual([]);
  });
});

describe('cross-branch migration-version guard', () => {
  const f15 = {
    ref: 'refs/remotes/origin/015-forms-intake',
    filenames: ['20261107030000_f15_slider_middle_label_required.sql'],
  };
  const f16 = {
    ref: 'refs/remotes/origin/016-catalog-ui',
    filenames: ['20261107030000_catalog_workspace_exercise_remove.sql'],
  };
  const main = {
    ref: 'refs/remotes/origin/main',
    filenames: ['20261106115100_catalog_change.sql'],
  };

  it('fails when one version maps to two different filenames across refs', () => {
    const conflicts = findCrossRefVersionConflicts([main, f15, f16]);
    expect(conflicts).toHaveLength(1);
    const conflict = conflicts[0];
    expect(conflict).toBeDefined();
    expect(conflict?.version).toBe('20261107030000');
    const filenames = conflict?.files.map((file) => file.filename).sort();
    expect(filenames).toEqual([
      '20261107030000_catalog_workspace_exercise_remove.sql',
      '20261107030000_f15_slider_middle_label_required.sql',
    ]);
    for (const file of conflict?.files ?? []) {
      expect(file.refs).toHaveLength(1);
    }
  });

  it('passes when the same version and filename appear on several refs', () => {
    const shared = {
      ref: 'refs/remotes/origin/016-exercise-food-catalogs',
      filenames: ['20261107030000_catalog_workspace_exercise_remove.sql'],
    };
    expect(findCrossRefVersionConflicts([f16, shared])).toEqual([]);
  });

  it('passes when no version overlaps across refs', () => {
    expect(findCrossRefVersionConflicts([main, f15])).toEqual([]);
  });

  it('reports every conflicting version in a single run', () => {
    const other = {
      ref: 'refs/remotes/origin/017-workout-planner',
      filenames: ['20261108040000_a.sql'],
    };
    const otherMain = {
      ref: 'refs/remotes/origin/main',
      filenames: ['20261106115100_catalog_change.sql', '20261108040000_b.sql'],
    };
    const conflicts = findCrossRefVersionConflicts([
      other,
      otherMain,
      f15,
      f16,
    ]);
    expect(conflicts.map((conflict) => conflict.version).sort()).toEqual([
      '20261107030000',
      '20261108040000',
    ]);
  });

  it('ignores filenames without a 14-digit version', () => {
    expect(
      findCrossRefVersionConflicts([
        { ref: 'refs/remotes/origin/a', filenames: ['not-a-migration.sql'] },
        { ref: 'refs/remotes/origin/b', filenames: ['also-not.sql'] },
      ]),
    ).toEqual([]);
  });

  it('checkRemoteRefs uses the injected ref-lister and reports failure', async () => {
    let called = 0;
    const result = await checkRemoteRefs(async () => {
      called += 1;
      return [main, f15, f16];
    });
    expect(called).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.refCount).toBe(3);
    expect(result.conflicts.map((conflict) => conflict.version)).toEqual([
      '20261107030000',
    ]);
  });

  it('checkRemoteRefs passes when nothing conflicts', async () => {
    const result = await checkRemoteRefs(async () => [main, f15]);
    expect(result.ok).toBe(true);
    expect(result.conflicts).toEqual([]);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import approvedF16Copy from '../fixtures/approved-f16-copy.json';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

describe('approved F16 copy', () => {
  it('ships every approved F16 Arabic and English string verbatim', () => {
    const rows = approvedF16Copy as {
      key: keyof typeof ar;
      ar: string;
      en: string;
    }[];
    for (const row of rows) {
      expect(en[row.key], `${row.key} English copy`).toBe(row.en);
      expect(ar[row.key], `${row.key} Arabic copy`).toBe(row.ar);
    }
  });

  it('marks all 18 S27 post-batch library/detail keys as DRAFT in both message catalogs', () => {
    const evidence = readFileSync(
      'specs/016-exercise-food-catalogs/S27-library-evidence.md',
      'utf8',
    );
    const draftKeys = [
      'catalog.addExercise',
      'catalog.nextPage',
      'catalog.paginationLabel',
      'catalog.editorScope',
      'catalog.editorGlobalScope',
      'catalog.editorWorkspaceScope',
      'catalog.editorWorkspace',
      'catalog.detailTitle',
      'catalog.detailVersion',
      'catalog.detailWorkspace',
      'catalog.detailVideo',
      'catalog.detailOpenVideo',
      'catalog.detailNoVideo',
      'catalog.detailMergedTo',
      'catalog.editAsNewVersion',
      'catalog.editorErrorTextTooLong',
      'catalog.foodErrorTooLong',
      'catalog.editorSecondaryMuscles',
    ];
    expect(draftKeys).toHaveLength(18);
    const catalogs = ['lib/i18n/messages/ar.ts', 'lib/i18n/messages/en.ts'];
    for (const source of catalogs) {
      const text = readFileSync(source, 'utf8');
      for (const key of draftKeys)
        expect(text).toContain(`// DRAFT (S27): ${key}`);
    }
    for (const key of draftKeys) expect(evidence).toContain(`- \`${key}\``);
  });
});

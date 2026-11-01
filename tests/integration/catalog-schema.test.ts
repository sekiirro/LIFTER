import { afterAll, describe, expect, it } from 'vitest';
import { sql } from './harness';

const db = sql();
const expectedMuscles = [
  'chest',
  'lats',
  'upper_back',
  'traps',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'spinal_erectors',
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'abductors',
  'calves',
];
const expectedEquipment = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'smith_machine',
  'bodyweight',
  'kettlebell',
  'resistance_band',
  'suspension_trainer',
  'other',
];

async function rowCount(table: 'exercises' | 'foods') {
  const [relation] = await db`
    select to_regclass(${`public.${table}`})::text as name
  `;
  if (!relation?.name) return 0;
  const rows = await db.unsafe(
    `select count(*)::int as count from public.${table}`,
  );
  return rows[0]?.count ?? 0;
}

afterAll(async () => db.end());

describe('catalog taxonomy foundation', () => {
  it('seeds the exact approved versioned bilingual taxonomy and no catalog entries', async () => {
    const terms = await db`
      select t.kind, t.code, v.label_en, v.label_ar, v.version
      from public.taxonomy_terms t
      join public.taxonomy_term_versions v on v.term_id = t.id and v.version = 1
      order by t.kind, t.code
    `;
    expect(
      terms
        .filter((term) => term.kind === 'muscle_group')
        .map((term) => term.code)
        .sort(),
    ).toEqual(expectedMuscles.sort());
    expect(
      terms
        .filter((term) => term.kind === 'equipment')
        .map((term) => term.code)
        .sort(),
    ).toEqual(expectedEquipment.sort());
    expect(terms).toHaveLength(28);
    expect(
      terms.every(
        (term) =>
          term.label_ar.trim() && term.label_en.trim() && term.version === 1,
      ),
    ).toBe(true);
    expect(await rowCount('exercises')).toBe(0);
    expect(await rowCount('foods')).toBe(0);
  });
});

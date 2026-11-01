import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  carryForwardNutritionSelection,
  duplicateNutritionItem,
  NUTRITION_ID_CONTINUITY_RULES,
  NutritionIdContinuityError,
  retainNutritionDocumentIds,
  type NutritionAlternativeSelection,
  type NutritionItemIdAssignment,
  type NutritionItemLocation,
} from '../../lib/plans/nutrition/id-continuity';
import {
  normalizeNutritionDocument,
  type NutritionDocument,
} from '../../lib/plans/nutrition/schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type FixtureCase = {
  name: string;
  candidate: unknown;
  expected: {
    itemIds: string[];
    alternativeIds: string[];
    selection: NutritionAlternativeSelection | null;
  };
};

type IdContinuityFixture = {
  previous: unknown;
  selection: NutritionAlternativeSelection;
  duplicate: {
    source: NutritionItemLocation;
    assignment: NutritionItemIdAssignment;
  };
  cases: FixtureCase[];
};

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, '../fixtures/nutrition/id-continuity-v1.json'),
    'utf-8',
  ),
) as IdContinuityFixture;

function itemIds(document: NutritionDocument): string[] {
  return document.meals.flatMap((meal) => meal.items.map((item) => item.id));
}

function alternativeIds(document: NutritionDocument): string[] {
  return document.meals.flatMap((meal) =>
    meal.items.flatMap((item) =>
      item.alternatives.map((alternative) => alternative.id),
    ),
  );
}

function findItem(
  document: NutritionDocument,
  itemId: string,
): NutritionDocument['meals'][number]['items'][number] {
  for (const meal of document.meals) {
    const item = meal.items.find((candidate) => candidate.id === itemId);
    if (item) return item;
  }
  throw new Error(`Fixture item ${itemId} was not found`);
}

function fixtureCase(name: string): FixtureCase {
  const found = fixture.cases.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Fixture case ${name} was not found`);
  return found;
}

describe('F18 nutrition stable id continuity (S24-PO-3)', () => {
  it('freezes the item, alternative, and selection rule table', () => {
    expect(NUTRITION_ID_CONTINUITY_RULES).toEqual({
      quantity: {
        itemId: 'retain',
        alternativeId: 'retain',
        selection: 'carry',
      },
      notes: {
        itemId: 'retain',
        alternativeId: 'retain',
        selection: 'carry',
      },
      reorder: {
        itemId: 'retain',
        alternativeId: 'retain',
        selection: 'carry',
      },
      move: {
        itemId: 'retain',
        alternativeId: 'retain',
        selection: 'carry',
      },
      replaceItemFood: {
        itemId: 'replace',
        alternativeId: 'replace',
        selection: 'reset',
      },
      replaceAlternativeFood: {
        itemId: 'retain',
        alternativeId: 'replace',
        selection: 'reset',
      },
      remove: {
        itemId: 'remove',
        alternativeId: 'remove',
        selection: 'reset',
      },
      duplicate: {
        itemId: 'replace',
        alternativeId: 'replace',
        selection: 'none',
      },
    });
    expect(Object.isFrozen(NUTRITION_ID_CONTINUITY_RULES)).toBe(true);
  });

  it.each(fixture.cases.map((candidate) => [candidate.name, candidate]))(
    '%s',
    (_name, testCase) => {
      const previous = normalizeNutritionDocument(fixture.previous);
      const candidate = normalizeNutritionDocument(testCase.candidate);

      const retained = retainNutritionDocumentIds(previous, candidate);

      expect(itemIds(retained)).toEqual(testCase.expected.itemIds);
      expect(alternativeIds(retained)).toEqual(
        testCase.expected.alternativeIds,
      );
      expect(
        carryForwardNutritionSelection(previous, retained, fixture.selection),
      ).toEqual(testCase.expected.selection);
    },
  );

  it('duplicates an item with new descendant ids and no inherited choice', () => {
    const previous = normalizeNutritionDocument(fixture.previous);
    const original = structuredClone(previous);

    const duplicated = duplicateNutritionItem(
      previous,
      fixture.duplicate.source,
      fixture.duplicate.assignment,
    );

    expect(previous).toEqual(original);
    const source = findItem(previous, fixture.duplicate.source.itemId);
    const duplicate = findItem(duplicated, fixture.duplicate.assignment.itemId);
    expect(duplicate.foodVersionId).toBe(source.foodVersionId);
    expect(duplicate.quantity).toEqual(source.quantity);
    expect(duplicate.notes).toBe(source.notes);
    expect(duplicate.id).not.toBe(source.id);
    expect(duplicate.alternatives.map((alternative) => alternative.id)).toEqual(
      fixture.duplicate.assignment.alternativeIds,
    );
    expect(
      carryForwardNutritionSelection(previous, duplicated, fixture.selection),
    ).toEqual(fixture.selection);
    expect(
      carryForwardNutritionSelection(previous, duplicated, {
        itemId: fixture.duplicate.assignment.itemId,
        alternativeId: fixture.duplicate.assignment.alternativeIds[0]!,
      }),
    ).toBeNull();
  });

  it('does not mutate either revision while retaining continuity', () => {
    const previous = normalizeNutritionDocument(fixture.previous);
    const candidate = normalizeNutritionDocument(
      fixtureCase('quantity and notes retain ids and carry the choice')
        .candidate,
    );
    const originalPrevious = structuredClone(previous);
    const originalCandidate = structuredClone(candidate);

    retainNutritionDocumentIds(previous, candidate);

    expect(previous).toEqual(originalPrevious);
    expect(candidate).toEqual(originalCandidate);
  });

  it('rejects reusing an item id when its food identity changes', () => {
    const previous = normalizeNutritionDocument(fixture.previous);
    const raw = fixtureCase(
      'replacing an item food remaps its id and resets the choice',
    ).candidate as NutritionDocument;
    const candidate = structuredClone(raw);
    const replaced = candidate.meals[1]!.items[1]!;
    replaced.id = fixture.selection.itemId;

    expect(() => retainNutritionDocumentIds(previous, candidate)).toThrow(
      NutritionIdContinuityError,
    );
  });

  it('rejects reusing an alternative id when its food identity changes', () => {
    const previous = normalizeNutritionDocument(fixture.previous);
    const raw = fixtureCase(
      'replacing an alternative food remaps its id and resets the choice',
    ).candidate as NutritionDocument;
    const candidate = structuredClone(raw);
    candidate.meals[0]!.items[0]!.alternatives[0]!.id =
      fixture.selection.alternativeId;

    expect(() => retainNutritionDocumentIds(previous, candidate)).toThrow(
      NutritionIdContinuityError,
    );
  });

  it('rejects duplicate assignments that collide with existing ids', () => {
    const previous = normalizeNutritionDocument(fixture.previous);

    expect(() =>
      duplicateNutritionItem(previous, fixture.duplicate.source, {
        itemId: fixture.duplicate.source.itemId,
        alternativeIds: fixture.duplicate.assignment.alternativeIds,
      }),
    ).toThrow(NutritionIdContinuityError);
  });

  it('rejects incomplete duplicate alternative assignments', () => {
    const previous = normalizeNutritionDocument(fixture.previous);

    expect(() =>
      duplicateNutritionItem(previous, fixture.duplicate.source, {
        itemId: fixture.duplicate.assignment.itemId,
        alternativeIds: [],
      }),
    ).toThrow(NutritionIdContinuityError);
  });
});

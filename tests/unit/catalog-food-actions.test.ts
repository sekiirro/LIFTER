import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createFoodMock, candidatesMock } = vi.hoisted(() => ({
  createFoodMock: vi.fn(),
  candidatesMock: vi.fn(),
}));

vi.mock('../../lib/catalog/server', () => ({
  createFood: createFoodMock,
  foodDuplicateCandidates: candidatesMock,
}));

import {
  reviewFoodDuplicatesAction,
  saveCatalogFoodAction,
} from '../../app/(dashboard)/catalog-foods/actions';
import type { FoodEditorDraft } from '../../lib/catalog/food-editor';

const draft: FoodEditorDraft = {
  nameAr: 'أرز',
  nameEn: 'Rice',
  basis: 'g',
  productIdentity: 'rice',
  preparationIdentity: 'boiled',
  weighingState: 'cooked',
  kcal: '130',
  protein: '2.7',
  carbs: '28',
  fat: '0.3',
  fiber: '',
  servings: [{ labelAr: 'حصة', labelEn: 'serving', basisQuantity: '100' }],
  alternatives: [],
};
const operationKey = '11111111-1111-4111-8111-111111111111';

describe('catalog food server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createFoodMock.mockResolvedValue({
      status: 'ok',
      data: { food_id: 'food-1' },
    });
    candidatesMock.mockResolvedValue({ status: 'ok', data: [] });
  });

  it('blocks unsupported alternative persistence instead of silently dropping alternatives', async () => {
    const result = await saveCatalogFoodAction(
      {
        ...draft,
        alternatives: [
          { foodId: 'food-2', portionQuantity: '50', portionUnit: 'g' },
        ],
      },
      'workspace-1',
      false,
      operationKey,
    );
    expect(result).toEqual({ status: 'unsupported_alternatives' });
    expect(createFoodMock).not.toHaveBeenCalled();
  });

  it('passes explicit near-match confirmation and only supported food fields through the wall', async () => {
    const result = await saveCatalogFoodAction(
      draft,
      'workspace-1',
      true,
      operationKey,
    );
    expect(result.status).toBe('ok');
    expect(createFoodMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        operationKey,
        request: expect.objectContaining({
          confirm_near_match: true,
          product_identity_norm: 'rice',
        }),
      }),
    );
    const request = createFoodMock.mock.calls[0]?.[0].request;
    expect(request).not.toHaveProperty('alternatives');
    expect(request).not.toHaveProperty('created_by');
    expect(request).not.toHaveProperty('origin_workspace_id');
  });

  it('returns safe duplicate candidates without creator or origin provenance', async () => {
    candidatesMock.mockResolvedValue({
      status: 'ok',
      data: [
        {
          food_id: 'food-2',
          version: 3,
          match_type: 'near',
          name_ar: 'أرز مطبوخ',
          name_en: 'Cooked rice',
          kcal: 130,
          created_by: 'private-user',
          origin_workspace_id: 'private-workspace',
        },
      ],
    });
    const result = await reviewFoodDuplicatesAction(draft);
    expect(result).toEqual({
      status: 'near',
      candidates: [
        {
          id: 'food-2',
          names: { ar: 'أرز مطبوخ', en: 'Cooked rice' },
          basis: 'g',
          kcal: 130,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private-user|private-workspace|created_by|origin_workspace_id/,
    );
  });

  it('skips duplicate candidates whose kcal value is missing or non-numeric', async () => {
    candidatesMock.mockResolvedValue({
      status: 'ok',
      data: [
        { food_id: 'food-missing-kcal', match_type: 'near' },
        { food_id: 'food-string-kcal', match_type: 'near', kcal: '130' },
      ],
    });

    expect(await reviewFoodDuplicatesAction(draft)).toEqual({
      status: 'none',
      candidates: [],
    });
  });
});

import { describe, expect, it } from 'vitest';
import { exerciseOptions } from '../../lib/catalog/exercise-options';

describe('catalog variation exercise options', () => {
  it('uses the RPC localized name and falls back to the other locale', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(
      exerciseOptions(
        [
          {
            result_id: id,
            result_payload: { name_ar: 'ضغط الصدر', name_en: 'Chest press' },
          },
          {
            result_id: '22222222-2222-4222-8222-222222222222',
            result_payload: { name_ar: '', name_en: 'Fallback press' },
          },
        ],
        'ar',
      ),
    ).toEqual([
      { id, label: 'ضغط الصدر' },
      {
        id: '22222222-2222-4222-8222-222222222222',
        label: 'Fallback press',
      },
    ]);
  });

  it('does not expose a raw exercise id when both localized names are missing', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(
      exerciseOptions([{ result_id: id, result_payload: { names: {} } }], 'en'),
    ).toEqual([]);
  });
});

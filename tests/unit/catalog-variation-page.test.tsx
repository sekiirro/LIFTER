import { describe, expect, it, vi } from 'vitest';
import { exerciseOptions } from '../../app/(app)/catalog-variations/page';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: vi.fn() }));
vi.mock('server-only', () => ({}));

describe('catalog variation exercise options', () => {
  it('does not expose a raw exercise id when both localized names are missing', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(
      exerciseOptions(
        [{ result_id: id, result_payload: { names: {} } }],
        'en',
      ),
    ).toEqual([]);
  });
});

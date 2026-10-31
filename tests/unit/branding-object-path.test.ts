import { describe, expect, it } from 'vitest';
import { brandingValidatedObjectName } from '../../lib/branding/object-path';

describe('validated branding object identity', () => {
  it('keeps content hash identity while making separate upload generations distinct', () => {
    const hash = 'a'.repeat(64);
    expect(
      brandingValidatedObjectName(
        '00000000-0000-4000-8000-000000000001',
        'banner',
        hash,
        '00000000-0000-4000-8000-000000000002',
        'image/png',
      ),
    ).toBe(
      `00000000-0000-4000-8000-000000000001/validated/banner/${hash}-00000000-0000-4000-8000-000000000002.png`,
    );
    expect(
      brandingValidatedObjectName(
        '00000000-0000-4000-8000-000000000001',
        'banner',
        hash,
        '00000000-0000-4000-8000-000000000003',
        'image/png',
      ),
    ).not.toBe(
      brandingValidatedObjectName(
        '00000000-0000-4000-8000-000000000001',
        'banner',
        hash,
        '00000000-0000-4000-8000-000000000002',
        'image/png',
      ),
    );
  });
});

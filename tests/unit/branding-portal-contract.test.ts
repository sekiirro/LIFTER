import { describe, expect, it } from 'vitest';
import { createPortalBrandContract } from '../../lib/branding/portal-contract';

describe('conditional Client Portal brand contract', () => {
  it('projects only the approved localized brand name and derived brand tokens', () => {
    expect(
      createPortalBrandContract({
        workspaceName: 'Elite Gym',
        color: '#059669',
      }),
    ).toEqual({
      workspaceName: 'Elite Gym',
      color: '#059669',
      tokens: expect.objectContaining({
        source: '#059669',
        light: expect.any(Object),
        dark: expect.any(Object),
      }),
    });
  });

  it('accepts a localized name chosen by the authorized projection without portal behavior', () => {
    expect(
      createPortalBrandContract({
        workspaceName: 'نادي النخبة',
        color: '#ABC123',
      }).workspaceName,
    ).toBe('نادي النخبة');
  });
});

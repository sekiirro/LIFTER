import { describe, expect, it } from 'vitest';
import { buildCatalogShowcaseHref } from '../../lib/catalog/showcase-href';

describe('catalog showcase navigation', () => {
  it('preserves sample brand on all control changes', () => {
    expect(
      buildCatalogShowcaseHref(
        {
          kind: 'exercise',
          state: 'ready',
          view: 'editor',
          role: 'trainer',
          reps: 'range',
          scope: 'workspace',
          coachingWork: true,
        },
        true,
      ),
    ).toContain('&brand=sample');
  });

  it('omits the sample brand when it is not selected', () => {
    expect(
      buildCatalogShowcaseHref(
        {
          kind: 'food',
          state: 'ready',
          view: 'list',
          role: 'po',
          reps: 'fixed',
          scope: 'global',
          coachingWork: false,
        },
        false,
      ),
    ).not.toContain('brand=');
  });
});

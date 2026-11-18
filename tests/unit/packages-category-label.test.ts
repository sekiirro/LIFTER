import { expect, it } from 'vitest';
import {
  marketLabel,
  typeLabel,
  categoryLabel,
} from '../../lib/packages/category-label';

it('uses the S34-PO-2 approved market and type labels including exact tatweel', () => {
  expect(marketLabel('Egypt', 'en')).toBe('Egypt');
  expect(marketLabel('International', 'en')).toBe('International');
  expect(typeLabel('Year-round', 'en')).toBe('Year-Round');
  expect(typeLabel('Promotional', 'en')).toBe('Promotional');

  expect(marketLabel('Egypt', 'ar')).toBe('مصر');
  expect(marketLabel('International', 'ar')).toBe('دولي');
  expect(typeLabel('Year-round', 'ar')).toBe('طول السن\u0640ة');
  expect(typeLabel('Promotional', 'ar')).toBe('وقت الع\u0640روض');

  expect(categoryLabel('Egypt', 'Year-round', 'en')).toBe('Egypt · Year-Round');
  expect(categoryLabel('International', 'Promotional', 'ar')).toBe(
    'دولي · وقت الع\u0640روض',
  );
});

import { expect, it } from 'vitest';
import { tierLabel } from '../../lib/packages/tier-label';

it('uses the PO-approved tier labels for each locale', () => {
  expect([1, 2, 3].map((rank) => tierLabel(rank as 1 | 2 | 3, 'en'))).toEqual([
    'Silver',
    'Gold',
    'Platinum',
  ]);
  expect([1, 2, 3].map((rank) => tierLabel(rank as 1 | 2 | 3, 'ar'))).toEqual([
    'سيلفر',
    'جولد',
    'بلاتينيوم',
  ]);
});

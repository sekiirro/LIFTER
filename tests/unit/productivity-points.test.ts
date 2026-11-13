import { describe, expect, it } from 'vitest';
import {
  POINTS_PER_NEW_CLIENT,
  pointsForEvent,
} from '../../lib/productivity/points';

describe('productivity point rules', () => {
  it('awards exactly one point per new client', () => {
    expect(POINTS_PER_NEW_CLIENT).toBe(1);
    expect(pointsForEvent('new_client')).toBe(1);
  });

  it.each([
    { event: 'returning_client' as const, name: 'returning clients' },
    { event: 'upgrade' as const, name: 'upgrades' },
    { event: 'renewal' as const, name: 'renewals' },
    { event: 'plan_publication' as const, name: 'plan publications' },
  ])('awards zero additional points for $name', ({ event }) => {
    expect(pointsForEvent(event)).toBe(0);
  });
});

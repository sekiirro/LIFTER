import { describe, expect, it } from 'vitest';
import {
  parseCategoryIdentity,
  isCurrencyAllowedForMarket,
} from '../../lib/packages/validation';

describe('market and type identity validation', () => {
  it.each([
    ['Egypt', 'Year-round'],
    ['Egypt', 'Promotional'],
    ['International', 'Year-round'],
    ['International', 'Promotional'],
  ] as const)('accepts the fixed category pair %s / %s', (market, type) => {
    expect(
      parseCategoryIdentity({
        workspaceId: '00000000-0000-0000-0000-000000000001',
        market,
        type,
      }),
    ).toEqual({
      workspaceId: '00000000-0000-0000-0000-000000000001',
      market,
      type,
    });
  });

  it.each([
    {},
    { workspaceId: null, market: 'Egypt', type: 'Year-round' },
    { workspaceId: 'workspace-a', market: 'Egypt', type: 'Year-round' },
    {
      workspaceId: '00000000-0000-0000-0000-000000000001',
      market: 'egypt',
      type: 'Year-round',
    },
    {
      workspaceId: '00000000-0000-0000-0000-000000000001',
      market: 'Egypt',
      type: 'year-round',
    },
    {
      workspaceId: '00000000-0000-0000-0000-000000000001',
      market: 'Egypt',
      type: 'Other',
    },
  ])('rejects absent, unknown, or noncanonical identity %#', (input) => {
    expect(parseCategoryIdentity(input)).toBeNull();
  });

  it('does not infer a category market from its currency', () => {
    expect(
      parseCategoryIdentity({
        workspaceId: '00000000-0000-0000-0000-000000000001',
        type: 'Year-round',
        currency: 'EGP',
      }),
    ).toBeNull();
  });

  it.each([
    ['Egypt', 'EGP', true],
    ['Egypt', 'USD', false],
    ['Egypt', 'SAR', false],
    ['International', 'EGP', true],
    ['International', 'USD', true],
    ['International', 'SAR', true],
    ['International', 'EUR', false],
    ['International', 'XTS', false],
    ['Egypt', 'egp', false],
    ['unknown', 'EGP', false],
  ] as const)(
    'validates market %s with currency %s',
    (market, currency, allowed) => {
      expect(isCurrencyAllowedForMarket(market, currency)).toBe(allowed);
    },
  );
});

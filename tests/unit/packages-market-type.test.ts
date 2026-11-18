import { describe, expect, it } from 'vitest';
import {
  parseCategoryIdentity,
  isCurrencyAllowedForMarket,
} from '../../lib/packages/validation';
import { formatMinorUnits } from '../../lib/packages/money';

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
    ['Egypt', 'EUR', false],
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

  it.each([
    ['Egypt', 'EGP'],
    ['International', 'EGP'],
    ['International', 'USD'],
    ['International', 'SAR'],
  ] as const)(
    'formats %s package prices in their own %s currency without conversion',
    (market, currency) => {
      expect(isCurrencyAllowedForMarket(market, currency)).toBe(true);
      expect(formatMinorUnits('12345', currency, 'en')).toBe(
        `123.45 ${currency}`,
      );
    },
  );

  it('keeps displayed package prices separate by their own currency', () => {
    const prices = [
      { market: 'Egypt', currency: 'EGP', minor: '12345' },
      { market: 'International', currency: 'USD', minor: '12345' },
      { market: 'International', currency: 'SAR', minor: '12345' },
    ] as const;

    const displayed = prices.map(({ market, currency, minor }) => {
      expect(isCurrencyAllowedForMarket(market, currency)).toBe(true);
      return formatMinorUnits(minor, currency, 'en');
    });

    expect(displayed).toEqual(['123.45 EGP', '123.45 USD', '123.45 SAR']);
  });
});

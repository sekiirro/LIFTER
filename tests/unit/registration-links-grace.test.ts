import { expect, it } from 'vitest';
import {
  registrationLinkValidity,
  registrationLinkStatus,
} from '../../lib/registration-links/grace';
import {
  graceExpiry as E,
  graceClockRows as clockRows,
} from '../fixtures/registration-links-clock';
it.each(clockRows)('strict grace table %#', (opened, now, valid) => {
  expect(
    registrationLinkValidity(
      { expiresAt: E, openedAt: opened, consumedAt: null },
      now,
    ).valid,
  ).toBe(valid);
});
it.each(clockRows)('consumed dominates every clock row %#', (opened, now) => {
  expect(
    registrationLinkValidity(
      { expiresAt: E, openedAt: opened, consumedAt: E - 1 },
      now,
    ).valid,
  ).toBe(false);
});
it.each([
  [null, null, E - 1, 'valid'],
  [E - 3600000, null, E - 1, 'opened'],
  [null, null, E, 'expired'],
  [E - 7200000, null, E, 'expired'],
  [E - 3600000, E - 1800000, E - 1, 'consumed'],
  [null, E - 1, E + 1, 'consumed'],
  [E - 600000, null, E + 1199999, 'opened'],
  [E - 600000, null, E + 1200000, 'expired'],
  [E + 60000, null, E + 120000, 'expired'],
  [null, null, E - 1, 'valid'],
] as const)(
  'recent status precedence opened=%s consumed=%s now=%s -> %s',
  (opened, consumed, now, status) => {
    expect(
      registrationLinkStatus(
        { expiresAt: E, openedAt: opened, consumedAt: consumed },
        now,
      ),
    ).toBe(status);
  },
);
it('uses strict equality boundaries at the effective deadline', () => {
  const unopened = { expiresAt: E, openedAt: null, consumedAt: null };
  expect(registrationLinkValidity(unopened, E - 1)).toEqual({
    valid: true,
    validUntil: E,
  });
  expect(registrationLinkValidity(unopened, E)).toEqual({
    valid: false,
    validUntil: E,
  });
  const opened = { expiresAt: E, openedAt: E - 600000, consumedAt: null };
  const validUntil = E + 1200000;
  expect(registrationLinkValidity(opened, validUntil - 1)).toEqual({
    valid: true,
    validUntil,
  });
  expect(registrationLinkValidity(opened, validUntil)).toEqual({
    valid: false,
    validUntil,
  });
});
it('never slides or shortens the effective deadline', () => {
  const openedEarly = { expiresAt: E, openedAt: E - 7200000, consumedAt: null };
  const early = registrationLinkValidity(openedEarly, E - 1000);
  const late = registrationLinkValidity(openedEarly, E - 1);
  expect(early.validUntil).toBe(E);
  expect(late.validUntil).toBe(E);
  expect(early.validUntil).toBe(late.validUntil);
  const openedNearExpiry = {
    expiresAt: E,
    openedAt: E - 600000,
    consumedAt: null,
  };
  const graceUntil = E + 1200000;
  expect(registrationLinkValidity(openedNearExpiry, E).validUntil).toBe(
    graceUntil,
  );
  expect(
    registrationLinkValidity(openedNearExpiry, E + 1199999).validUntil,
  ).toBe(graceUntil);
  expect(
    registrationLinkValidity(openedNearExpiry, E + 1200000).validUntil,
  ).toBe(graceUntil);
});
it('rejects invalid times and never grants grace to a post-expiry first open', () => {
  for (const expiresAt of ['bad', '', NaN, Infinity, -Infinity])
    expect(
      registrationLinkValidity(
        { expiresAt, openedAt: null, consumedAt: null },
        E,
      ).valid,
    ).toBe(false);
  for (const openedAt of ['bad', '', NaN, Infinity, -Infinity])
    expect(
      registrationLinkValidity(
        { expiresAt: E, openedAt, consumedAt: null },
        E - 1,
      ).valid,
    ).toBe(false);
  for (const now of [NaN, Infinity, -Infinity])
    expect(
      registrationLinkValidity(
        { expiresAt: E, openedAt: null, consumedAt: null },
        now,
      ).valid,
    ).toBe(false);
  expect(
    registrationLinkValidity(
      { expiresAt: E, openedAt: E + 60000, consumedAt: null },
      E + 120000,
    ),
  ).toEqual({ valid: false, validUntil: E });
});
it('gives consumed precedence even when other times are malformed', () => {
  expect(
    registrationLinkStatus(
      { expiresAt: 'bad', openedAt: 'bad', consumedAt: E },
      E,
    ),
  ).toBe('consumed');
  expect(
    registrationLinkStatus(
      { expiresAt: E, openedAt: 'bad', consumedAt: null },
      E - 1,
    ),
  ).toBe('expired');
});

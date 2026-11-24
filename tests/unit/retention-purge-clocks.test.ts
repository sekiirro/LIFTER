import { describe, expect, it } from 'vitest';
import {
  isAuditRetentionEligible,
  isClosureRetentionEligible,
  RETENTION_PERIOD_MS,
} from '../../lib/retention-purge/clocks';

const day = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-24T12:00:00.000Z');

describe('retention purge clocks', () => {
  it('uses exactly the decided 30-day period without an override argument', () => {
    expect(RETENTION_PERIOD_MS).toBe(30 * day);
    expect(isClosureRetentionEligible.length).toBe(2);
    expect(isAuditRetentionEligible.length).toBe(2);
  });

  it('does not select client data inside the closure clock', () => {
    const closedAt = new Date(now.getTime() - 29 * day);

    expect(isClosureRetentionEligible(closedAt, now)).toBe(false);
  });

  it('selects client data after the full closure clock elapses', () => {
    const closedAt = new Date(now.getTime() - 30 * day);

    expect(isClosureRetentionEligible(closedAt, now)).toBe(true);
  });

  it('never selects data for an active account without a closure timestamp', () => {
    expect(isClosureRetentionEligible(null, now)).toBe(false);
  });

  it('starts the audit clock at event creation', () => {
    const createdAt29DaysAgo = new Date(now.getTime() - 29 * day);
    const createdAt30DaysAgo = new Date(now.getTime() - 30 * day);

    expect(isAuditRetentionEligible(createdAt29DaysAgo, now)).toBe(false);
    expect(isAuditRetentionEligible(createdAt30DaysAgo, now)).toBe(true);
  });
});

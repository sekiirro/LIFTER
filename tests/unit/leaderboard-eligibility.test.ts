import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLeaderboardCandidate } from '../../lib/leaderboard/candidate';
import {
  LEADERBOARD_MIN_ACTIVE_DAYS,
  deriveLeaderboardEligibility,
  parseEligibilityPool,
  type LeaderboardEligibilityFacts,
} from '../../lib/leaderboard/eligibility';
import type {
  LeaderboardScoreInputSource,
  LeaderboardScoreRequest,
} from '../../lib/leaderboard/score-inputs';

function facts(
  patch: Partial<LeaderboardEligibilityFacts> = {},
): LeaderboardEligibilityFacts {
  return {
    clientId: 'client-a',
    entitlementStatus: 'active',
    activeDays: 14,
    optedOut: false,
    hasUsername: true,
    ...patch,
  };
}

describe('T016/T018 eligibility over F13 facts (FR-010-FR-014)', () => {
  it('requires an active subscription and 14 accrued active days', () => {
    expect(deriveLeaderboardEligibility(facts())).toEqual({ eligible: true });
    expect(deriveLeaderboardEligibility(facts({ activeDays: 13 }))).toEqual({
      eligible: false,
      reason: 'insufficient_active_days',
    });
    for (const status of [
      'awaiting_activation',
      'future',
      'expired',
      'refunded',
    ] as const)
      expect(
        deriveLeaderboardEligibility(facts({ entitlementStatus: status })),
      ).toEqual({ eligible: false, reason: 'not_active' });
    expect(
      deriveLeaderboardEligibility(facts({ entitlementStatus: null })),
    ).toEqual({ eligible: false, reason: 'no_subscription' });
  });

  it('is not eligible during a freeze even with enough accrued days (FR-012)', () => {
    expect(
      deriveLeaderboardEligibility(
        facts({ entitlementStatus: 'frozen', activeDays: 60 }),
      ),
    ).toEqual({ eligible: false, reason: 'not_active' });
  });

  it('excludes opted-out clients first and clients without a username', () => {
    expect(
      deriveLeaderboardEligibility(facts({ optedOut: true, activeDays: 0 })),
    ).toEqual({ eligible: false, reason: 'opted_out' });
    expect(deriveLeaderboardEligibility(facts({ hasUsername: false }))).toEqual(
      { eligible: false, reason: 'no_username' },
    );
  });

  it('rejects malformed active-day counts', () => {
    expect(() =>
      deriveLeaderboardEligibility(facts({ activeDays: -1 })),
    ).toThrow(RangeError);
    expect(() =>
      deriveLeaderboardEligibility(facts({ activeDays: 1.5 })),
    ).toThrow(RangeError);
  });

  it('keeps the 14-day threshold in parity with the database wall', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20261117000000_f24_client_leaderboard.sql',
      ),
      'utf8',
    );
    expect(LEADERBOARD_MIN_ACTIVE_DAYS).toBe(14);
    expect(sql).toContain("(f.facts->>'active_days')::integer >= 14");
    expect(sql).toContain('app_private.f24_active_days(ws, sid, as_of, 14)');
    // Accrual counts only days on which the F13 projection is `active`.
    expect(sql).toContain(
      "if app_private.f13_project_entitlement(ws, sid, d)->>'status' = 'active' then",
    );
  });

  it('parses the PO pool strictly and rejects unknown statuses', () => {
    expect(
      parseEligibilityPool([
        {
          client_id: 'c1',
          entitlement_status: 'active',
          active_days: 14,
          opted_out: false,
          has_username: true,
        },
      ]),
    ).toEqual([facts({ clientId: 'c1' })]);
    expect(
      parseEligibilityPool([
        {
          client_id: 'c1',
          entitlement_status: 'paused',
          active_days: 14,
          opted_out: false,
          has_username: true,
        },
      ]),
    ).toBeNull();
    expect(parseEligibilityPool({})).toBeNull();
  });
});

describe('candidate pipeline filters before requesting spec 023 inputs', () => {
  it('asks the source only for eligible clients and refuses widened results', async () => {
    const requests: LeaderboardScoreRequest[] = [];
    const source: LeaderboardScoreInputSource = {
      async loadScoreInputs(request) {
        requests.push(request);
        return request.clientIds.map((clientId) => ({
          clientId,
          clientCode: clientId,
          workoutAdherence: 6,
          dietAdherence: 6,
          normalizedProgress: 0.3,
          achievedOn: '2026-11-05',
        }));
      },
    };
    const ranked = await buildLeaderboardCandidate({
      workspaceId: 'ws-a',
      periodMonth: '2026-11-01',
      pool: [
        facts({ clientId: 'eligible' }),
        facts({ clientId: 'opted-out', optedOut: true }),
        facts({ clientId: 'frozen', entitlementStatus: 'frozen' }),
        facts({ clientId: 'new', activeDays: 3 }),
      ],
      incumbentClientIds: ['opted-out'],
      source,
    });
    expect(requests).toEqual([
      {
        workspaceId: 'ws-a',
        periodMonth: '2026-11-01',
        clientIds: ['eligible'],
      },
    ]);
    expect(ranked).toEqual([{ rank: 1, clientId: 'eligible' }]);

    const widening: LeaderboardScoreInputSource = {
      async loadScoreInputs() {
        return [
          {
            clientId: 'foreign-client',
            clientCode: 'x',
            workoutAdherence: 1,
            dietAdherence: 1,
            normalizedProgress: 0,
            achievedOn: '2026-11-05',
          },
        ];
      },
    };
    await expect(
      buildLeaderboardCandidate({
        workspaceId: 'ws-a',
        periodMonth: '2026-11-01',
        pool: [facts()],
        incumbentClientIds: [],
        source: widening,
      }),
    ).rejects.toThrow(RangeError);
  });
});

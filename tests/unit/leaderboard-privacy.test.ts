import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_AUDIT_DETAIL_KEYS,
  LEADERBOARD_AUDIT_EVENTS,
  isAllowedAuditDetails,
} from '../../lib/leaderboard/audit';
import {
  LEADERBOARD_ENTRY_FIELDS,
  toClientLeaderboardSelf,
  toLeaderboardView,
  toPendingCandidateView,
} from '../../lib/leaderboard/projection';
import { en } from '../../lib/i18n/messages/en';
import { ar } from '../../lib/i18n/messages/ar';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261117000000_f24_client_leaderboard.sql',
  ),
  'utf8',
);

describe('T027/T028 display allow-list (FR-022-FR-024, SC-004)', () => {
  it('copies only rank and username even when the payload carries more', () => {
    const view = toLeaderboardView({
      status: 'available',
      period_month: '2026-11-01',
      score: 0.9,
      workspace_id: 'ws',
      entries: [
        {
          rank: 2,
          username: 'b.user',
          client_id: 'c2',
          composite: 0.7,
          weight_kg: 81,
          workoutAdherence: 9,
        },
        { rank: 1, username: 'a.user', note: 'internal' },
      ],
    });
    expect(view).toEqual({
      status: 'available',
      periodMonth: '2026-11-01',
      entries: [
        { rank: 1, username: 'a.user' },
        { rank: 2, username: 'b.user' },
      ],
    });
    if (view.status !== 'available') throw new Error('expected available');
    for (const entry of view.entries)
      expect(Object.keys(entry).sort()).toEqual(
        [...LEADERBOARD_ENTRY_FIELDS].sort(),
      );
    expect(Object.keys(view).sort()).toEqual(
      ['entries', 'periodMonth', 'status'].sort(),
    );
  });

  it('fails closed on malformed, oversized or duplicate-rank payloads', () => {
    const entry = (rank: number) => ({ rank, username: `user_${rank}` });
    for (const payload of [
      null,
      [],
      { status: 'available', period_month: '2026-11-15', entries: [] },
      {
        status: 'available',
        period_month: '2026-11-01',
        entries: [1, 2, 3, 4, 5, 6].map((rank) => entry(Math.min(rank, 5))),
      },
      {
        status: 'available',
        period_month: '2026-11-01',
        entries: [entry(1), entry(1)],
      },
      {
        status: 'available',
        period_month: '2026-11-01',
        entries: [{ rank: 1, username: 'Not Valid!' }],
      },
    ])
      expect(toLeaderboardView(payload)).toEqual({ status: 'unavailable' });
    expect(toLeaderboardView({ status: 'empty' })).toEqual({ status: 'empty' });
  });

  it('treats an approved list whose every entry opted out as empty (FR-008)', () => {
    expect(
      toLeaderboardView({
        status: 'available',
        period_month: '2026-11-01',
        entries: [],
      }),
    ).toEqual({ status: 'empty' });
  });

  it('applies the same allow-list to the PO pending review and client self state', () => {
    const pending = toPendingCandidateView({
      status: 'pending',
      publication_id: '3f1c2a4e-1b2c-4d5e-8f90-123456789abc',
      period_month: '2026-11-01',
      entries: [{ rank: 1, username: 'a.user', score: 1 }],
    });
    expect(pending).toEqual({
      status: 'pending',
      publicationId: '3f1c2a4e-1b2c-4d5e-8f90-123456789abc',
      periodMonth: '2026-11-01',
      entries: [{ rank: 1, username: 'a.user' }],
    });
    expect(
      toClientLeaderboardSelf({
        status: 'ok',
        username: 'a.user',
        opted_out: false,
        eligible: true,
        active_days: 20,
      }),
    ).toEqual({
      status: 'ok',
      username: 'a.user',
      optedOut: false,
      eligible: true,
    });
  });

  it('builds database entries from rank and username only', () => {
    expect(migration).toContain(
      "jsonb_agg(jsonb_build_object('rank', v.rank, 'username', v.username) order by v.rank)",
    );
    // No score or health columns exist on any leaderboard relation.
    for (const forbidden of [
      'score',
      'adherence',
      'weight',
      'measurement',
      'answer',
    ]) {
      const tableBlocks = migration.match(
        /create table public\.leaderboard_[a-z_]+ \([\s\S]*?\n\);/gu,
      );
      expect(tableBlocks?.length).toBe(3);
      for (const block of tableBlocks ?? [])
        expect(block.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe('T004 audit allow-list (FR-036, FR-039, FR-040)', () => {
  it('uses only the reviewed actions and detail keys in the migration', () => {
    const inserts = [
      ...migration.matchAll(
        /insert into public\.audit_events\(actor_user_id, action, target_table, target_id, workspace_id, details\)\s+values \(([\s\S]*?)\)(?:\s+returning id into event_id)?;/gu,
      ),
    ];
    expect(inserts.length).toBe(3);
    const actions = new Set(
      [...migration.matchAll(/'((?:leaderboard|client)\.[a-z_]+)'/gu)]
        .map((match) => match[1]!)
        .filter((action) => action in LEADERBOARD_AUDIT_EVENTS),
    );
    expect([...actions].sort()).toEqual(
      Object.keys(LEADERBOARD_AUDIT_EVENTS).sort(),
    );
    for (const [, body] of inserts)
      for (const key of FORBIDDEN_AUDIT_DETAIL_KEYS)
        expect(body).not.toContain(`'${key}'`);
    expect(migration).toContain(
      "jsonb_build_object('period_month', to_char(pub.period_month, 'YYYY-MM-DD'), 'entry_count', entry_count)",
    );
  });

  it('rejects details outside the allow-list', () => {
    expect(
      isAllowedAuditDetails('leaderboard.publication_approved', {
        period_month: '2026-11-01',
        entry_count: 5,
      }),
    ).toBe(true);
    expect(
      isAllowedAuditDetails('leaderboard.client_opted_out', {
        username: 'a.user',
      }),
    ).toBe(false);
  });
});

describe('T015/T030 approved copy only (FR-038)', () => {
  const proposal = readFileSync(
    resolve(process.cwd(), 'specs/024-client-leaderboard/copy-proposal.md'),
    'utf8',
  );
  const approved = new Map<string, { en: string; ar: string }>();
  for (const line of proposal.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    const key = /^`([^`]+)`$/u.exec(cells[1] ?? '')?.[1];
    if (key && cells[4]?.startsWith('APPROVED'))
      approved.set(key, { en: cells[2]!, ar: cells[3]! });
  }

  it('ships every F24 catalog key byte-exact from the approved proposal', () => {
    const keys = Object.keys(en).filter(
      (key) =>
        key.startsWith('leaderboard.') ||
        key.startsWith('accountSettings.') ||
        /^clientSignup\.username\./u.test(key),
    ) as (keyof typeof en)[];
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const row = approved.get(key);
      expect(row, `${key} must be approved`).toBeDefined();
      expect(en[key]).toBe(row!.en);
      expect(ar[key]).toBe(row!.ar);
    }
  });

  it('never discloses scoring mechanics in client-facing leaderboard copy', () => {
    for (const catalog of [en, ar])
      for (const [key, value] of Object.entries(catalog))
        if (key.startsWith('leaderboard.'))
          expect(value).not.toMatch(
            /score|adherence|progress|weight|formula|%|نقاط|التزام|تقدم|وزن/iu,
          );
  });
});

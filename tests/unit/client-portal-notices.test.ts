import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: vi.fn(async () => null),
}));
const actorMock = vi.hoisted(() => ({ getActor: vi.fn() }));
vi.mock('../../lib/auth/actor', () => actorMock);
const noticesMock = vi.hoisted(() => ({ markRead: vi.fn() }));

import {
  CLIENT_NOTICE_KINDS,
  NOTICE_MESSAGE,
  projectClientNotices,
  projectMarkNoticeResult,
  renderableNotices,
} from '../../lib/client-access/notices-projection';
import {
  loadClientNotices,
  markClientNotice,
} from '../../lib/client-access/notices';
import { getMessages } from '../../lib/i18n';

// Synthetic identifiers only.
const noticeA = '11111111-1111-4111-8111-111111111111';
const noticeB = '22222222-2222-4222-8222-222222222222';
const row = (overrides: Record<string, unknown> = {}) => ({
  notice_id: noticeA,
  notice_kind: 'workout_delivered',
  created_at: '2026-11-14T08:00:00Z',
  read_at: null,
  ...overrides,
});

describe('F22 client notice projection (T019; FR-009)', () => {
  it('accepts the closed IDs-only shape', () => {
    expect(
      projectClientNotices({
        status: 'ok',
        notices: [
          row(),
          row({ notice_id: noticeB, read_at: '2026-11-14T09:00:00Z' }),
        ],
      }),
    ).toEqual({
      status: 'ok',
      notices: [
        {
          noticeId: noticeA,
          kind: 'workout_delivered',
          createdAt: '2026-11-14T08:00:00Z',
          readAt: null,
        },
        {
          noticeId: noticeB,
          kind: 'workout_delivered',
          createdAt: '2026-11-14T08:00:00Z',
          readAt: '2026-11-14T09:00:00Z',
        },
      ],
    });
  });

  it('fails closed on non-clients, duplicates, unknown kinds and malformed rows', () => {
    for (const raw of [
      null,
      { status: 'invalid' },
      { status: 'invalid_input' },
      { status: 'ok' },
      { status: 'ok', notices: [row(), row()] },
      { status: 'ok', notices: [row({ notice_kind: 'form_alert' })] },
      { status: 'ok', notices: [row({ notice_id: 'x' })] },
      { status: 'ok', notices: [row({ created_at: 'never' })] },
      { status: 'ok', notices: [row({ read_at: 7 })] },
    ])
      expect(projectClientNotices(raw), JSON.stringify(raw)).toEqual({
        status: 'denied',
      });
  });

  it('renders every kind that has approved copy', () => {
    const parsed = projectClientNotices({
      status: 'ok',
      notices: [
        row(),
        row({ notice_id: noticeB, notice_kind: 'checkin_reminder_day_of' }),
      ],
    });
    if (parsed.status !== 'ok') throw new Error('expected ok');
    expect(renderableNotices(parsed.notices)).toEqual([
      expect.objectContaining({
        noticeId: noticeA,
        message: 'client.portal.notice.workoutDelivered',
      }),
      expect.objectContaining({
        noticeId: noticeB,
        message: 'checkin.reminder.dayOf.body',
      }),
    ]);
  });

  it('maps the F23 kinds to approved F23 copy present in both catalogs', () => {
    const proposal = readFileSync(
      'specs/023-client-progress-coaching/copy-proposal.md',
      'utf8',
    );
    const en = getMessages('en');
    const ar = getMessages('ar');
    for (const kind of [
      'checkin_reminder_day_of',
      'checkin_reminder_followup',
      'food_replacement_resolved',
    ] as const) {
      const key = NOTICE_MESSAGE[kind];
      if (!key) throw new Error(kind);
      expect(proposal, key).toContain(key);
      expect(proposal, key).toContain(en[key]);
      expect(proposal, key).toContain(ar[key]);
    }
  });

  it('maps every F22 kind to an approved key present in both catalogs', () => {
    const proposal = readFileSync(
      'specs/022-client-portal-delivery/copy-proposal.md',
      'utf8',
    );
    const en = getMessages('en');
    const ar = getMessages('ar');
    const keys = CLIENT_NOTICE_KINDS.flatMap((kind) => {
      const key = NOTICE_MESSAGE[kind];
      return key?.startsWith('client.portal.notice.') ? [key] : [];
    });
    expect(keys).toHaveLength(5);
    for (const key of [
      ...keys,
      'client.portal.inbox.markRead',
      'client.portal.inbox.empty',
    ] as const) {
      expect(proposal, key).toContain(`\`${key}\``);
      expect(proposal, key).toContain(en[key]);
      expect(proposal, key).toContain(ar[key]);
    }
  });

  it('accepts only read / not_found from mark-read', () => {
    expect(projectMarkNoticeResult({ status: 'read' })).toEqual({
      status: 'read',
    });
    expect(projectMarkNoticeResult({ status: 'not_found' })).toEqual({
      status: 'not_found',
    });
    for (const raw of [null, { status: 'invalid' }, { status: 'ok' }])
      expect(projectMarkNoticeResult(raw)).toEqual({ status: 'denied' });
  });
});

describe('F22 client notice RPC adapters (T019)', () => {
  it('reads one bounded page and fails closed on transport errors', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'ok', notices: [] },
      error: null,
    }));
    await expect(loadClientNotices({ rpc })).resolves.toEqual({
      status: 'ok',
      notices: [],
    });
    expect(rpc).toHaveBeenCalledWith('read_client_notices', {
      p_limit: 20,
      p_before: null,
    });
    const failing = { rpc: async () => ({ data: null, error: { code: 'x' } }) };
    await expect(loadClientNotices(failing)).resolves.toEqual({
      status: 'denied',
    });
  });

  it('never calls the database for a malformed notice id', async () => {
    const rpc = vi.fn();
    await expect(markClientNotice({ rpc }, 'not-a-uuid')).resolves.toEqual({
      status: 'not_found',
    });
    await expect(markClientNotice({ rpc }, null)).resolves.toEqual({
      status: 'not_found',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends only the notice id; the client comes from the session', async () => {
    const rpc = vi.fn(async () => ({ data: { status: 'read' }, error: null }));
    await expect(markClientNotice({ rpc }, noticeA)).resolves.toEqual({
      status: 'read',
    });
    expect(rpc).toHaveBeenCalledWith('mark_client_notice_read', {
      p_notice_id: noticeA,
    });
  });
});

describe('F22 mark-read server action recipient wall (T019)', () => {
  beforeEach(() => {
    actorMock.getActor.mockReset();
    noticesMock.markRead.mockReset();
  });

  it('denies staff and anonymous callers before any database call', async () => {
    vi.doMock('../../lib/client-access/notices', () => ({
      markClientNoticeRead: noticesMock.markRead,
    }));
    const { markClientNoticeReadAction } =
      await import('../../app/(client)/plans/actions');
    const form = new FormData();
    form.set('noticeId', noticeA);
    for (const actor of [
      null,
      { userId: 'staff', role: 'trainer' },
      { userId: 'po', role: 'platform_owner' },
    ]) {
      actorMock.getActor.mockResolvedValueOnce(actor);
      await expect(markClientNoticeReadAction(form)).resolves.toEqual({
        status: 'denied',
      });
    }
    expect(noticesMock.markRead).not.toHaveBeenCalled();
    actorMock.getActor.mockResolvedValueOnce({ userId: 'client', role: null });
    noticesMock.markRead.mockResolvedValueOnce({ status: 'read' });
    await expect(markClientNoticeReadAction(form)).resolves.toEqual({
      status: 'read',
    });
    expect(noticesMock.markRead).toHaveBeenCalledWith(noticeA);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getMessages } from '../../lib/i18n';
import {
  STAFF_NOTICE_MESSAGE,
  markStaffNoticeResult,
  parseStaffNotices,
} from '../../lib/progress-coaching/food-replacement/notice-projection';

const ID = '11111111-1111-4111-8111-111111111111';
const WS = '22222222-2222-4222-8222-222222222222';
const REQ = '33333333-3333-4333-8333-333333333333';

const row = (patch: Record<string, unknown> = {}) => ({
  notice_id: ID,
  workspace_id: WS,
  notice_kind: 'food_replacement_open',
  source_key: REQ,
  created_at: '2026-11-18T10:00:00Z',
  read_at: null,
  ...patch,
});

describe('staff notice projection (T033/T040)', () => {
  it('parses ids-only rows', () => {
    expect(parseStaffNotices({ status: 'ok', notices: [row()] })).toEqual({
      status: 'ok',
      notices: [
        {
          noticeId: ID,
          workspaceId: WS,
          kind: 'food_replacement_open',
          requestId: REQ,
          createdAt: '2026-11-18T10:00:00Z',
          readAt: null,
        },
      ],
    });
    expect(parseStaffNotices({ status: 'ok', notices: [] })).toEqual({
      status: 'ok',
      notices: [],
    });
  });

  it('fails closed on unknown kinds, bad ids, duplicates and wrong shapes', () => {
    for (const raw of [
      null,
      { status: 'invalid_input' },
      { status: 'ok' },
      { status: 'ok', notices: [row({ notice_kind: 'form_alert' })] },
      { status: 'ok', notices: [row({ notice_id: 'x' })] },
      { status: 'ok', notices: [row({ source_key: 5 })] },
      { status: 'ok', notices: [row({ created_at: 'never' })] },
      { status: 'ok', notices: [row({ read_at: 7 })] },
      { status: 'ok', notices: [row(), row()] },
    ])
      expect(parseStaffNotices(raw), JSON.stringify(raw)).toEqual({
        status: 'denied',
      });
  });

  it('accepts only read / not_found from mark-read', () => {
    expect(markStaffNoticeResult({ status: 'read' })).toBe('read');
    expect(markStaffNoticeResult({ status: 'not_found' })).toBe('not_found');
    expect(markStaffNoticeResult({ status: 'x' })).toBe('denied');
    expect(markStaffNoticeResult(null)).toBe('denied');
  });

  it('uses the approved copy in both catalogs', () => {
    const proposal = readFileSync(
      'specs/023-client-progress-coaching/copy-proposal.md',
      'utf8',
    );
    const key = STAFF_NOTICE_MESSAGE.food_replacement_open;
    expect(proposal).toContain(key);
    expect(proposal).toContain(getMessages('en')[key]);
    expect(proposal).toContain(getMessages('ar')[key]);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  cookies: vi.fn(),
  session: vi.fn(),
  collections: vi.fn(),
  commissions: vi.fn(),
  installments: vi.fn(),
  platformReport: vi.fn(),
  drilldownRows: vi.fn(),
  push: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ requireActor: mocks.actor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.session,
}));
vi.mock('../../lib/packages/reporting', () => ({
  getPackageMonthlyCollections: mocks.collections,
  getPackageCommissionReport: mocks.commissions,
  getPackageInstallmentReport: mocks.installments,
  getPlatformAggregateReport: mocks.platformReport,
  getWorkspaceDrilldownRows: mocks.drilldownRows,
}));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));

import ReportsPage, {
  isIsoTimestamp,
  MAX_CURSOR_HISTORY_LENGTH,
  validateReportsPagerInput,
} from '../../app/(app)/reports/page';

describe('S75-430-01 Reports Pager URL Input Validation', () => {
  const validUuid1 = '00000000-0000-4000-8000-000000000001';
  const validUuid2 = '00000000-0000-4000-8000-000000000002';
  const validIso1 = '2026-11-20T10:00:00Z';
  const validIso2 = '2026-11-19T08:30:00.000Z';
  const validIsoWithOffset = '2026-11-19T10:30:00+02:00';

  describe('isIsoTimestamp', () => {
    it('accepts valid ISO-8601 timestamps', () => {
      expect(isIsoTimestamp(validIso1)).toBe(true);
      expect(isIsoTimestamp(validIso2)).toBe(true);
      expect(isIsoTimestamp(validIsoWithOffset)).toBe(true);
    });

    it('rejects invalid timestamps and non-string inputs', () => {
      expect(isIsoTimestamp('')).toBe(false);
      expect(isIsoTimestamp('not-a-date')).toBe(false);
      expect(isIsoTimestamp('2026-11-20')).toBe(false); // date only, no time
      expect(isIsoTimestamp('2026-13-20T10:00:00Z')).toBe(false); // invalid month
      expect(isIsoTimestamp('2026-11-32T10:00:00Z')).toBe(false); // invalid day
      expect(isIsoTimestamp('2026-11-20T25:00:00Z')).toBe(false); // invalid hour
      expect(isIsoTimestamp('2026-11-20 10:00:00')).toBe(false); // missing T and timezone
      expect(isIsoTimestamp(null)).toBe(false);
      expect(isIsoTimestamp(undefined)).toBe(false);
      expect(isIsoTimestamp(12345)).toBe(false);
      expect(isIsoTimestamp({})).toBe(false);
      expect(isIsoTimestamp("2026-11-20T10:00:00Z'; DROP TABLE--")).toBe(false);
    });
  });

  describe('MAX_CURSOR_HISTORY_LENGTH', () => {
    it('is bounded appropriately based on RPC page size', () => {
      expect(MAX_CURSOR_HISTORY_LENGTH).toBeGreaterThan(0);
      expect(MAX_CURSOR_HISTORY_LENGTH).toBeLessThanOrEqual(100);
    });
  });

  describe('validateReportsPagerInput', () => {
    it('returns first page defaults when no cursor params are provided', () => {
      expect(validateReportsPagerInput({})).toEqual({
        cursor: null,
        cursorHistory: [],
      });
    });

    it('returns first page when cursor_recorded_at is provided without cursor_event_id', () => {
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
    });

    it('returns first page when cursor_event_id is provided without cursor_recorded_at', () => {
      expect(
        validateReportsPagerInput({
          cursor_event_id: validUuid1,
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
    });

    it('returns first page when cursor_recorded_at is not a valid ISO timestamp', () => {
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: 'not-a-timestamp',
          cursor_event_id: validUuid1,
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
    });

    it('returns first page when cursor_event_id is not a valid UUID', () => {
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
          cursor_event_id: 'ev-0', // non-UUID
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
    });

    it('returns first page when cursor_history contains invalid JSON', () => {
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
          cursor_event_id: validUuid1,
          cursor_history: '{invalid-json',
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
    });

    it('returns first page when cursor_history is a JSON object instead of an array', () => {
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
          cursor_event_id: validUuid1,
          cursor_history: '{"recorded_at":"2026-11-20T10:00:00Z"}',
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
    });

    it('returns first page when cursor_history is a JSON primitive', () => {
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
          cursor_event_id: validUuid1,
          cursor_history: '"plain-string"',
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
          cursor_event_id: validUuid1,
          cursor_history: '12345',
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
    });

    it('returns first page when cursor_history exceeds MAX_CURSOR_HISTORY_LENGTH', () => {
      const overlimitHistory = Array.from(
        { length: MAX_CURSOR_HISTORY_LENGTH + 1 },
        () => ({
          recorded_at: validIso1,
          event_id: validUuid1,
        }),
      );
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
          cursor_event_id: validUuid1,
          cursor_history: JSON.stringify(overlimitHistory),
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
    });

    it('returns first page when cursor_history array element is a primitive', () => {
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
          cursor_event_id: validUuid1,
          cursor_history: JSON.stringify([123]),
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
          cursor_event_id: validUuid1,
          cursor_history: JSON.stringify(['string-item']),
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
    });

    it('returns first page when cursor_history array element has invalid recorded_at', () => {
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
          cursor_event_id: validUuid1,
          cursor_history: JSON.stringify([
            { recorded_at: 'bad-date', event_id: validUuid2 },
          ]),
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
    });

    it('returns first page when cursor_history array element has invalid event_id', () => {
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
          cursor_event_id: validUuid1,
          cursor_history: JSON.stringify([
            { recorded_at: validIso2, event_id: 'not-a-uuid' },
          ]),
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
    });

    it('returns first page when cursor_history array element has extraneous properties', () => {
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
          cursor_event_id: validUuid1,
          cursor_history: JSON.stringify([
            {
              recorded_at: validIso2,
              event_id: validUuid2,
              malicious: 'unexpected-payload',
            },
          ]),
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
    });

    it('returns first page when cursor is null but cursor_history is non-empty', () => {
      expect(
        validateReportsPagerInput({
          cursor_history: JSON.stringify([null]),
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
    });

    it('returns first page when parameters are string arrays (repeated query params)', () => {
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: [validIso1, validIso2],
          cursor_event_id: validUuid1,
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
          cursor_event_id: [validUuid1, validUuid2],
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
          cursor_event_id: validUuid1,
          cursor_history: ['[null]', '[null]'],
        }),
      ).toEqual({
        cursor: null,
        cursorHistory: [],
      });
    });

    it('valid round-trip: accepts valid cursor with empty history', () => {
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
          cursor_event_id: validUuid1,
        }),
      ).toEqual({
        cursor: {
          recorded_at: validIso1,
          event_id: validUuid1,
        },
        cursorHistory: [],
      });
    });

    it('valid round-trip: accepts valid cursor with valid history containing null and prior cursors', () => {
      const validHistory = [
        null,
        { recorded_at: validIso2, event_id: validUuid2 },
      ];
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
          cursor_event_id: validUuid1,
          cursor_history: JSON.stringify(validHistory),
        }),
      ).toEqual({
        cursor: {
          recorded_at: validIso1,
          event_id: validUuid1,
        },
        cursorHistory: validHistory,
      });
    });

    it('valid round-trip: accepts history at exactly MAX_CURSOR_HISTORY_LENGTH', () => {
      const maxHistory = [
        null,
        ...Array.from({ length: MAX_CURSOR_HISTORY_LENGTH - 1 }, () => ({
          recorded_at: validIso2,
          event_id: validUuid2,
        })),
      ];
      expect(
        validateReportsPagerInput({
          cursor_recorded_at: validIso1,
          cursor_event_id: validUuid1,
          cursor_history: JSON.stringify(maxHistory),
        }),
      ).toEqual({
        cursor: {
          recorded_at: validIso1,
          event_id: validUuid1,
        },
        cursorHistory: maxHistory,
      });
    });
  });

  describe('ReportsPage server component integration with invalid pager inputs', () => {
    const wsId = '00000000-0000-4000-8000-000000000001';
    const workspaces = [{ id: wsId, name: 'Main Gym' }];

    beforeEach(() => {
      vi.clearAllMocks();
      mocks.actor.mockResolvedValue({
        userId: '00000000-0000-4000-8000-000000000099',
        role: 'platform_owner',
        deleted: false,
        activeWorkspaceIds: [wsId],
      });
      mocks.cookies.mockResolvedValue({
        get: () => ({ value: 'en' }),
      });
      mocks.platformReport.mockResolvedValue({
        status: 'ok',
        period: '2026-11',
        breakdown: 'month',
        totals: {
          revenueConvertedEgpMinor: '10000',
          subscriptionCount: 1,
          clientCount: 1,
        },
        workspaceAggregates: [],
        breakdowns: [],
      });
      mocks.collections.mockResolvedValue({
        status: 'ok',
        month: '2026-11',
        collections: [],
        accounting_events: [],
        pending_event_ids: [],
        converted_egp_minor: '0',
      });
      mocks.commissions.mockResolvedValue({
        status: 'ok',
        month: '2026-11',
        commissions: [],
      });
      mocks.installments.mockResolvedValue({
        status: 'ok',
        installments: [],
      });
      mocks.session.mockResolvedValue({
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi
            .fn()
            .mockReturnValue(
              Promise.resolve({ data: workspaces, error: null }),
            ),
        })),
      });
      mocks.drilldownRows.mockResolvedValue({
        status: 'ok',
        workspaceId: wsId,
        workspaceName: 'Main Gym',
        rows: [],
        totals: {
          revenueConvertedEgpMinor: '0',
          subscriptionCount: 0,
          clientCount: 0,
        },
        hasMore: false,
        nextCursor: null,
      });
    });

    it('falls back to first page (cursor: null) without error copy when cursor is invalid', async () => {
      const element = await ReportsPage({
        searchParams: Promise.resolve({
          month: '2026-11',
          drilldown: wsId,
          cursor_recorded_at: 'malformed-timestamp',
          cursor_event_id: validUuid1,
        }),
      });

      expect(mocks.drilldownRows).toHaveBeenCalledWith({
        workspaceId: wsId,
        monthStart: '2026-11-01',
        cursor: null,
      });

      const html = renderToStaticMarkup(element);
      const doc = new JSDOM(html).window.document;
      // No error alert rendered
      expect(doc.querySelector('[role="alert"]')).toBeNull();
      expect(html).not.toContain('error');
    });

    it('falls back to first page (cursor: null) without error copy when cursor_history is invalid', async () => {
      const element = await ReportsPage({
        searchParams: Promise.resolve({
          month: '2026-11',
          drilldown: wsId,
          cursor_recorded_at: validIso1,
          cursor_event_id: validUuid1,
          cursor_history: '{"not":"an-array"}',
        }),
      });

      expect(mocks.drilldownRows).toHaveBeenCalledWith({
        workspaceId: wsId,
        monthStart: '2026-11-01',
        cursor: null,
      });

      const html = renderToStaticMarkup(element);
      const doc = new JSDOM(html).window.document;
      expect(doc.querySelector('[role="alert"]')).toBeNull();
    });

    it('passes validated cursor to RPC when valid', async () => {
      const element = await ReportsPage({
        searchParams: Promise.resolve({
          month: '2026-11',
          drilldown: wsId,
          cursor_recorded_at: validIso1,
          cursor_event_id: validUuid1,
        }),
      });

      expect(mocks.drilldownRows).toHaveBeenCalledWith({
        workspaceId: wsId,
        monthStart: '2026-11-01',
        cursor: {
          recorded_at: validIso1,
          event_id: validUuid1,
        },
      });

      const html = renderToStaticMarkup(element);
      const doc = new JSDOM(html).window.document;
      expect(doc.querySelector('[role="alert"]')).toBeNull();
    });
  });
});

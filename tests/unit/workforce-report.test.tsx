import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import WorkforceReportPage from '../../app/(app)/workforce/report/page';
import { WorkforceReportView } from '../../components/workforce/WorkforceReportView';
import {
  cairoCurrentMonth,
  isValidMonth,
  shiftMonth,
  fetchWorkforceReport,
} from '../../lib/workforce/report';
import type { WorkforceReportData } from '../../lib/workforce/report-types';
import { getMessages } from '../../lib/i18n';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  cookies: vi.fn(),
  session: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ requireActor: mocks.actor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.session,
}));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));

const wsId = '00000000-0000-0000-0000-000000000001';
const trainerId = '11111111-1111-1111-1111-111111111111';
const salesId = '22222222-2222-2222-2222-222222222222';

const sampleReport: WorkforceReportData = {
  workspace_id: wsId,
  month: '2026-11-01',
  status: 'current',
  is_closed: false,
  snapshot: null,
  totals: [
    {
      staff_user_id: trainerId,
      role: 'trainer',
      display_name: 'Coach Ahmed',
      points: '-1.25',
      is_negative: true,
    },
    {
      staff_user_id: salesId,
      role: 'sales',
      display_name: 'Sales Rep Sara',
      points: '3.00',
      is_negative: false,
    },
  ],
  trainers: [
    {
      staff_user_id: trainerId,
      role: 'trainer',
      display_name: 'Coach Ahmed',
      points: '-1.25',
      is_negative: true,
    },
  ],
  sales: [
    {
      staff_user_id: salesId,
      role: 'sales',
      display_name: 'Sales Rep Sara',
      points: '3.00',
      is_negative: false,
    },
  ],
  ledger: [
    {
      id: 'entry-1',
      staff_user_id: trainerId,
      staff_role: 'trainer',
      staff_name: 'Coach Ahmed',
      category: 'earned',
      points: '1.00',
      effective_month: '2026-11-01',
      original_month: '2026-11-01',
      actor: null,
      recorded_at: '2026-11-05T12:00:00Z',
      reason_code: 'p7-activation-v1',
    },
    {
      id: 'entry-2',
      staff_user_id: trainerId,
      staff_role: 'trainer',
      staff_name: 'Coach Ahmed',
      category: 'poAdjustment',
      points: '-2.25',
      effective_month: '2026-11-01',
      original_month: '2026-10-01',
      actor: null,
      recorded_at: '2026-11-06T14:30:00Z',
      reason_code: 'late-correction',
    },
    {
      id: 'entry-3',
      staff_user_id: salesId,
      staff_role: 'sales',
      staff_name: 'Sales Rep Sara',
      category: 'refundReversal',
      points: '-1.00',
      effective_month: '2026-11-01',
      original_month: '2026-11-01',
      actor: null,
      recorded_at: '2026-11-07T10:00:00Z',
      reason_code: 'refund_reversal',
    },
  ],
};

describe('workforce report helpers', () => {
  it('shiftMonth correctly shifts across boundaries', () => {
    expect(shiftMonth('2026-11', 1)).toBe('2026-12');
    expect(shiftMonth('2026-11', -1)).toBe('2026-10');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('isValidMonth validates YYYY-MM correctly', () => {
    expect(isValidMonth('2026-11')).toBe(true);
    expect(isValidMonth('2026-01')).toBe(true);
    expect(isValidMonth('2026-12')).toBe(true);
    expect(isValidMonth('2026-13')).toBe(false);
    expect(isValidMonth('2026-00')).toBe(false);
    expect(isValidMonth('invalid')).toBe(false);
    expect(isValidMonth(null)).toBe(false);
  });

  it('cairoCurrentMonth returns valid YYYY-MM format', () => {
    const month = cairoCurrentMonth();
    expect(isValidMonth(month)).toBe(true);
  });

  it('fetchWorkforceReport parses RPC response and errors', async () => {
    const mockClient = {
      rpc: vi.fn(),
    };

    mockClient.rpc.mockResolvedValueOnce({
      data: sampleReport,
      error: null,
    });
    const success = await fetchWorkforceReport(
      mockClient as unknown as SupabaseClient,
      wsId,
      '2026-11',
    );
    expect(success).toEqual({ status: 'ok', data: sampleReport });
    expect(mockClient.rpc).toHaveBeenCalledWith('p7_workforce_report', {
      p_workspace_id: wsId,
      p_month: '2026-11-01',
    });

    mockClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'not_permitted' },
    });
    const denied = await fetchWorkforceReport(
      mockClient as unknown as SupabaseClient,
      wsId,
      '2026-11',
    );
    expect(denied).toEqual({ status: 'denied' });

    mockClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'db_connection_error' },
    });
    const error = await fetchWorkforceReport(
      mockClient as unknown as SupabaseClient,
      wsId,
      '2026-11',
    );
    expect(error).toEqual({
      status: 'error',
      message: 'db_connection_error',
    });
  });
});

describe('WorkforceReportView', () => {
  const enMessages = getMessages('en');
  const arMessages = getMessages('ar');

  it('renders loading state', () => {
    const html = renderToStaticMarkup(
      createElement(WorkforceReportView, {
        report: null,
        status: 'loading',
        locale: 'en',
        messages: enMessages,
        currentMonth: '2026-11',
      }),
    );
    expect(html).toContain('Loading workforce report…');
    expect(html).toContain('aria-busy="true"');
  });

  it('renders denied state in EN and AR', () => {
    const enHtml = renderToStaticMarkup(
      createElement(WorkforceReportView, {
        report: null,
        status: 'denied',
        locale: 'en',
        messages: enMessages,
        currentMonth: '2026-11',
      }),
    );
    expect(enHtml).toContain('You cannot view the workforce report.');

    const arHtml = renderToStaticMarkup(
      createElement(WorkforceReportView, {
        report: null,
        status: 'denied',
        locale: 'ar',
        messages: arMessages,
        currentMonth: '2026-11',
      }),
    );
    expect(arHtml).toContain('مش مسموح لك تشوف تقرير الفريق.');
  });

  it('renders error state with retry button', () => {
    const html = renderToStaticMarkup(
      createElement(WorkforceReportView, {
        report: null,
        status: 'error',
        locale: 'en',
        messages: enMessages,
        currentMonth: '2026-11',
      }),
    );
    expect(html).toContain('Unable to load the workforce report. Try again.');
    expect(html).toContain('Retry');
  });

  it('renders empty state when no data exists', () => {
    const html = renderToStaticMarkup(
      createElement(WorkforceReportView, {
        report: {
          workspace_id: wsId,
          month: '2026-11-01',
          status: 'current',
          is_closed: false,
          snapshot: null,
          totals: [],
          trainers: [],
          sales: [],
          ledger: [],
        },
        status: 'ok',
        locale: 'en',
        messages: enMessages,
        currentMonth: '2026-11',
      }),
    );
    expect(html).toContain('No workforce data for this month.');
  });

  it('renders open month with current badge, formula, totals, negative badge, and ledger in EN', () => {
    const html = renderToStaticMarkup(
      createElement(WorkforceReportView, {
        report: sampleReport,
        status: 'ok',
        locale: 'en',
        messages: enMessages,
        currentMonth: '2026-11',
      }),
    );

    // Title & badge
    expect(html).toContain('Workforce report');
    expect(html).toContain('Current month');

    // Navigation
    expect(html).toContain('Previous month');
    expect(html).toContain('Next month');
    expect(html).toContain('2026-11');

    // Formula card
    expect(html).toContain(
      'Net points = earned + transformation/feedback − penalties + PO adjustments.',
    );
    expect(html).toContain('Refund reversals appear as entries in the ledger.');
    expect(html).toContain('Points are separate from salary.');

    // Staff totals
    expect(html).toContain('Trainer totals');
    expect(html).toContain('Sales totals');
    expect(html).toContain('Coach Ahmed');
    expect(html).toContain('-1.25');
    expect(html).toContain('Negative total');
    expect(html).toContain(
      'Negative totals are valid. They do not change salary.',
    );
    expect(html).toContain('Sales Rep Sara');
    expect(html).toContain('3.00');

    // Ledger
    expect(html).toContain('Ledger');
    expect(html).toContain('Earned');
    expect(html).toContain('PO adjustment');
    expect(html).toContain('Refund reversal');
    expect(html).toContain('Original month: 2026-10-01');
    expect(html).toContain('p7-activation-v1');
  });

  it('renders closed month badge and Arabic approved copy in AR', () => {
    const closedReport: WorkforceReportData = {
      ...sampleReport,
      is_closed: true,
      status: 'closed',
      snapshot: {
        id: 'snapshot-1',
        snapshot_version: 1,
        formula_version: 'p7-net-points-v1',
        source_watermark: '2026-11-01T00:00:00Z',
        totals: { [trainerId]: '-1.25', [salesId]: '3.00' },
        finalized_by: 'po-user-id',
        finalized_at: '2026-12-01T00:00:00Z',
      },
    };

    const html = renderToStaticMarkup(
      createElement(WorkforceReportView, {
        report: closedReport,
        status: 'ok',
        locale: 'ar',
        messages: arMessages,
        currentMonth: '2026-11',
      }),
    );

    expect(html).toContain('تقرير الفريق');
    expect(html).toContain('مقفول');
    expect(html).toContain('الشهر اللي فات');
    expect(html).toContain('الشهر الجاي');
    expect(html).toContain(
      'النقاط الصافية = المكتسبة + التحوّلات وآراء العملاء − الخصومات + تعديلات مالك المنصة.',
    );
    expect(html).toContain('عكس نقاط الاسترداد بيظهر كقيد في السجل.');
    expect(html).toContain('النقاط منفصلة عن المرتب.');
    expect(html).toContain('إجمالي المدرّبين');
    expect(html).toContain('إجمالي المبيعات');
    expect(html).toContain('إجمالي سالب');
    expect(html).toContain('الإجمالي السالب مقبول. مش بيغيّر المرتب.');
    expect(html).toContain('سجل النقاط');
    expect(html).toContain('المكتسبة');
    expect(html).toContain('تعديل مالك المنصة');
    expect(html).toContain('عكس نقاط الاسترداد');
    expect(html).toContain('الشهر الأصلي: 2026-10-01');
  });
});

describe('WorkforceReportPage server route', () => {
  const enMessages = getMessages('en');

  beforeEach(() => {
    mocks.actor.mockReset();
    mocks.cookies.mockReset();
    mocks.session.mockReset();
    mocks.from.mockReset();
    mocks.rpc.mockReset();

    mocks.cookies.mockResolvedValue({ get: () => ({ value: 'en' }) });
    mocks.session.mockResolvedValue({
      from: () => ({
        select: () => ({
          order: () =>
            Promise.resolve({
              data: [{ id: wsId, name: 'Main Gym' }],
              error: null,
            }),
        }),
      }),
      rpc: mocks.rpc,
    });
  });

  it('denies trainer role with workforce.report.denied', async () => {
    mocks.actor.mockResolvedValue({
      userId: trainerId,
      role: 'trainer',
      activeWorkspaceIds: [wsId],
    });

    const page = await WorkforceReportPage({
      searchParams: Promise.resolve({ workspace: wsId }),
    });
    const html = renderToStaticMarkup(page);
    expect(html).toContain(enMessages['workforce.report.denied']);
  });

  it('denies workspace_owner role with workforce.report.denied', async () => {
    mocks.actor.mockResolvedValue({
      userId: 'wo-id',
      role: 'workspace_owner',
      activeWorkspaceIds: [wsId],
    });

    const page = await WorkforceReportPage({
      searchParams: Promise.resolve({ workspace: wsId }),
    });
    const html = renderToStaticMarkup(page);
    expect(html).toContain(enMessages['workforce.report.denied']);
  });

  it('allows platform_owner role and renders the report', async () => {
    mocks.actor.mockResolvedValue({
      userId: 'po-id',
      role: 'platform_owner',
      activeWorkspaceIds: [wsId],
    });
    mocks.rpc.mockResolvedValue({
      data: sampleReport,
      error: null,
    });

    const page = await WorkforceReportPage({
      searchParams: Promise.resolve({ workspace: wsId, month: '2026-11' }),
    });
    const html = renderToStaticMarkup(page);
    expect(html).toContain('Workforce report');
    expect(html).toContain('Coach Ahmed');
  });
});

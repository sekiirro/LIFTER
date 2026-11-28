import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getMessages } from '../../lib/i18n';
import { en } from '../../lib/i18n/messages/en';
import { ar } from '../../lib/i18n/messages/ar';
import { WorkforceReportView } from '../../components/workforce/WorkforceReportView';
import type { WorkforceReportData } from '../../lib/workforce/report-types';
import { fetchSalesFunnel } from '../../lib/workforce/report';
import type { SalesFunnelRow } from '../../lib/workforce/report-types';

const workspaceId = '00000000-0000-0000-0000-000000000001';
const salesId = '22222222-2222-2222-2222-222222222222';

vi.mock('server-only', () => ({}));

const report = {
  workspace_id: workspaceId,
  month: '2026-11-01',
  status: 'current',
  is_closed: false,
  snapshot: null,
  totals: [
    {
      staff_user_id: salesId,
      role: 'sales',
      display_name: 'Sales Rep Sara',
      points: '1.00',
      is_negative: false,
    },
  ],
  trainers: [],
  sales: [
    {
      staff_user_id: salesId,
      role: 'sales',
      display_name: 'Sales Rep Sara',
      points: '1.00',
      is_negative: false,
    },
  ],
  ledger: [],
} satisfies WorkforceReportData;

const sampleRow = {
  month: '2026-11-01',
  sales_user_id: salesId,
  link_count: 12,
  registration_count: 9,
  approval_count: 7,
  first_payment_count: 6,
  acquisition_point_count: 6,
  acquisition_points: '6.00',
  refund_reversal_count: 2,
  refund_reversal_points: '-2.00',
  point_deduction_count: 3,
  point_deduction_points: '-1.50',
  po_adjustment_count: 1,
  po_adjustment_points: '0.75',
} satisfies SalesFunnelRow;

describe('fetchSalesFunnel', () => {
  it('requests the Cairo-selected month and returns typed event facts', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [sampleRow], error: null });
    const result = await fetchSalesFunnel(
      { rpc } as unknown as SupabaseClient,
      workspaceId,
      '2026-11',
    );

    expect(rpc).toHaveBeenCalledWith('get_sales_funnel', {
      workspace_id: workspaceId,
      p_month: '2026-11-01',
    });
    expect(result).toEqual({ status: 'ok', rows: [sampleRow] });
  });

  it('maps authorization and database failures to separate states', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'not_permitted' },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'XX000', message: 'db_connection_error' },
      });

    await expect(
      fetchSalesFunnel(
        { rpc } as unknown as SupabaseClient,
        workspaceId,
        '2026-11',
      ),
    ).resolves.toEqual({ status: 'denied' });
    await expect(
      fetchSalesFunnel(
        { rpc } as unknown as SupabaseClient,
        workspaceId,
        '2026-11',
      ),
    ).resolves.toEqual({ status: 'error' });
  });
});

describe('PO Sales funnel UI', () => {
  it('renders every approved category, the F21 name, integer counts, and signed point text', () => {
    const html = renderToStaticMarkup(
      createElement(WorkforceReportView, {
        report,
        status: 'ok',
        locale: 'en',
        messages: getMessages('en'),
        currentMonth: '2026-11',
        salesFunnel: { status: 'ok', rows: [sampleRow] },
      }),
    );

    expect(html).toContain('aria-label="Sales funnel details"');
    expect(html).toContain('Sales Rep Sara');
    expect(html).toContain('Links issued');
    expect(html).toContain('Registrations');
    expect(html).toContain('Approvals');
    expect(html).toContain('Confirmed first payments');
    expect(html).toContain('Acquisition points');
    expect(html).toContain('Refund reversals');
    expect(html).toContain('Point deductions');
    expect(html).toContain('PO adjustments');
    expect(html).toContain('>12<');
    expect(html).toContain('>-2.00<');
    expect(html).toContain('>-1.50<');
    expect(html).not.toContain('Sales funnel</h2>');
  });

  it('renders approved empty, error, and denied states in English and Arabic', () => {
    for (const locale of ['en', 'ar'] as const) {
      const m = getMessages(locale);
      const render = (salesFunnel: {
        status: 'ok' | 'loading' | 'error' | 'denied';
        rows?: SalesFunnelRow[];
      }) =>
        renderToStaticMarkup(
          createElement(WorkforceReportView, {
            report,
            status: 'ok',
            locale,
            messages: m,
            currentMonth: '2026-11',
            salesFunnel: {
              status: salesFunnel.status,
              rows: salesFunnel.rows ?? [],
            },
          }),
        );

      expect(render({ status: 'loading' })).toContain('aria-busy="true"');
      expect(render({ status: 'ok' })).toContain(
        m['workforce.salesFunnel.empty'],
      );
      expect(render({ status: 'error' })).toContain(
        m['workforce.salesFunnel.loadError'],
      );
      expect(render({ status: 'denied' })).toContain(
        m['workforce.salesFunnel.denied'],
      );
    }
  });

  it('keeps all Sales funnel copy byte-exact with the approved source', () => {
    const copy = readFileSync(
      new URL(
        '../../specs/027-workforce-management/copy-approved-sales-s74-po-2.md',
        import.meta.url,
      ),
      'utf8',
    );
    const approved = new Map<string, [string, string]>();
    for (const line of copy.split(/\r?\n/u)) {
      const match = line.match(
        /^\|\s*`([^`]+)`\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|/u,
      );
      if (match) approved.set(match[1]!, [match[2]!, match[3]!]);
    }

    const keys = [
      'workforce.salesFunnel.title',
      'workforce.salesFunnel.column.linksIssued',
      'workforce.salesFunnel.column.registrations',
      'workforce.salesFunnel.column.approvals',
      'workforce.salesFunnel.column.confirmedFirstPayments',
      'workforce.salesFunnel.column.acquisitionPoints',
      'workforce.salesFunnel.column.refundReversals',
      'workforce.salesFunnel.column.pointDeductions',
      'workforce.salesFunnel.column.poAdjustments',
      'workforce.salesFunnel.empty',
      'workforce.salesFunnel.loading',
      'workforce.salesFunnel.loadError',
      'workforce.salesFunnel.denied',
      'workforce.salesFunnel.aria.table',
    ] as const;

    for (const key of keys) {
      const pair = approved.get(key);
      expect(
        pair,
        `${key} must exist in the approved copy source`,
      ).toBeDefined();
      expect(en[key as keyof typeof en]).toBe(pair![0]);
      expect(ar[key as keyof typeof ar]).toBe(pair![1]);
    }
    expect(en['workforce.salesFunnel.title']).not.toBe('Sales funnel</h2>');
  });
});

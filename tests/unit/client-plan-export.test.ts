import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  exportClientNutritionPlan,
  parseExportFormat,
} from '../../lib/client-access/plan-export';
import {
  ALT_ONE,
  ITEM_ID,
  PLAN_ID,
  REVISION_ID,
  WORKSPACE_ID,
  rawOk,
} from './client-nutrition-fixture';

// F22 T023/T029 (FR-006, FR-008, FR-010, SC-005, SC-009), nutrition scope:
// the client export reuses the F18 print and Excel builders for exactly the
// selected revision. Workout exports are BLOCKED (see tasks.md).
type Call = [string, Record<string, unknown>];

function fakeClient(
  plan: unknown,
  options: { auditError?: boolean } = {},
): {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
  calls: Call[];
} {
  const calls: Call[] = [];
  return {
    calls,
    async rpc(name: string, args: Record<string, unknown> = {}) {
      calls.push([name, args]);
      if (name === 'client_portal_nutrition_plan')
        return { data: plan, error: null };
      if (name === 'record_nutrition_export_audit')
        return options.auditError
          ? { data: null, error: { code: 'XX000' } }
          : { data: null, error: null };
      throw new Error(`unexpected rpc ${name}`);
    },
  } as never;
}

const base = {
  planId: PLAN_ID,
  revisionNumber: 2,
  locale: 'en' as const,
};

describe('F22 client plan export (nutrition)', () => {
  it('accepts only the two closed formats', () => {
    expect(parseExportFormat('pdf')).toBe('pdf');
    expect(parseExportFormat('excel')).toBe('excel');
    for (const value of ['xlsx', 'PDF', '', null, undefined, ['pdf']])
      expect(parseExportFormat(value)).toBeNull();
  });

  it('exports the selected revision as print HTML with the client selection primary and audits success', async () => {
    const client = fakeClient(
      rawOk({ selections: [{ item_id: ITEM_ID, alternative_id: ALT_ONE }] }),
    );
    const result = await exportClientNutritionPlan(client as never, {
      ...base,
      format: 'pdf',
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.contentType).toBe('text/html; charset=utf-8');
    expect(result.filename).toBe('nutrition-plan-r2.html');
    const html = String(result.body);
    expect(html).toContain('Alternative One');
    expect(html).toContain('Coach Original Food');
    expect(html).toContain('225');
    // Formula-leading coach text is HTML-escaped and never executable markup.
    expect(html).not.toContain('<script');
    expect(client.calls.map(([name]) => name)).toEqual([
      'client_portal_nutrition_plan',
      'record_nutrition_export_audit',
    ]);
    expect(client.calls[0]![1]).toEqual({
      p_plan_id: PLAN_ID,
      p_revision_number: 2,
    });
    expect(client.calls[1]![1]).toEqual({
      p_workspace_id: WORKSPACE_ID,
      p_plan_id: PLAN_ID,
      p_revision_id: REVISION_ID,
      p_outcome: 'success',
      p_reason: null,
    });
  });

  it('exports an Excel workbook with the selection primary, the coach original as a side note and formula text neutralized', async () => {
    const client = fakeClient(
      rawOk({ selections: [{ item_id: ITEM_ID, alternative_id: ALT_ONE }] }),
    );
    const result = await exportClientNutritionPlan(client as never, {
      ...base,
      format: 'excel',
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.filename).toBe('nutrition-plan-r2.xlsx');
    expect(result.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.body as never);
    const sheet = workbook.worksheets[0]!;
    const cells: string[] = [];
    let formulaCell = 0;
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        cells.push(String(cell.value ?? ''));
        // No cell is ever a live formula.
        if (typeof cell.value === 'object' && cell.value !== null)
          if ('formula' in cell.value) formulaCell += 1;
      }),
    );
    expect(formulaCell).toBe(0);
    expect(cells.some((c) => c.includes('Alternative One'))).toBe(true);
    expect(cells.some((c) => c.includes('Coach Original Food'))).toBe(true);
    expect(cells.some((c) => c.includes('=HYPERLINK'))).toBe(true);
    expect(client.calls[1]![0]).toBe('record_nutrition_export_audit');
  });

  it('exports the Arabic locale as RTL', async () => {
    const result = await exportClientNutritionPlan(
      fakeClient(rawOk()) as never,
      { ...base, format: 'pdf', locale: 'ar' },
    );
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(String(result.body)).toContain('dir="rtl"');
  });

  it('denies every non-ok read identically, releases no file and audits one denial', async () => {
    for (const plan of [
      { status: 'not_found' },
      {
        status: 'restricted',
        subscription: {
          status: 'expired',
          effective_end_exclusive: '2026-01-01',
        },
      },
      { status: 'invalid' },
      null,
    ]) {
      const client = fakeClient(plan);
      const result = await exportClientNutritionPlan(client as never, {
        ...base,
        format: 'excel',
      });
      expect(result, JSON.stringify(plan)).toEqual({ status: 'denied' });
      expect(client.calls.map(([name]) => name)).toEqual([
        'client_portal_nutrition_plan',
        'record_nutrition_export_audit',
      ]);
      expect(client.calls[1]![1]).toMatchObject({
        p_plan_id: PLAN_ID,
        p_revision_id: null,
        p_outcome: 'denied',
      });
    }
  });

  it('fails closed when the success audit cannot be written', async () => {
    for (const format of ['pdf', 'excel'] as const) {
      const result = await exportClientNutritionPlan(
        fakeClient(rawOk(), { auditError: true }) as never,
        { ...base, format },
      );
      expect(result).toEqual({ status: 'denied' });
    }
  });

  it('keeps a denial a denial when the denial audit fails', async () => {
    const result = await exportClientNutritionPlan(
      fakeClient({ status: 'not_found' }, { auditError: true }) as never,
      { ...base, format: 'pdf' },
    );
    expect(result).toEqual({ status: 'denied' });
  });
});

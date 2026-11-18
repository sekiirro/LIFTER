import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  exportClientWorkoutPlan,
  parseClientWorkoutExportFormat,
  readClientWorkoutView,
} from '../../lib/workout-planner/client-export';
import {
  BENCH_URL,
  PLAN_ID,
  PRIVATE_URL,
  REVISION_ID,
  WORKSPACE_ID,
  rawOk,
} from './client-workout-fixture';

// F22 T023/T025/T028 (FR-006, FR-008, FR-010, SC-005, SC-009), workout scope:
// the client export reuses the F17 print payload and Excel writer for exactly
// the selected revision, audited through the F17 recorder.
type Call = [string, Record<string, unknown>];

function fakeClient(
  plan: unknown,
  options: { auditError?: boolean; auditThrows?: boolean } = {},
) {
  const calls: Call[] = [];
  return {
    calls,
    async rpc(name: string, args: Record<string, unknown> = {}) {
      calls.push([name, args]);
      if (name === 'client_portal_workout_plan')
        return { data: plan, error: null };
      if (name === 'record_workout_export_audit') {
        if (options.auditThrows) throw new Error('sink down');
        return options.auditError
          ? { data: null, error: { code: 'XX000' } }
          : { data: null, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

const base = { planId: PLAN_ID, revisionNumber: 2, locale: 'en' as const };

describe('client workout export', () => {
  it('accepts only the two closed formats', () => {
    expect(parseClientWorkoutExportFormat('pdf')).toBe('pdf');
    expect(parseClientWorkoutExportFormat('excel')).toBe('excel');
    for (const value of ['xlsx', 'PDF', '', 'ai_prompt', null, undefined])
      expect(parseClientWorkoutExportFormat(value)).toBeNull();
  });

  it('views the revision without writing an export audit event', async () => {
    const client = fakeClient(rawOk());
    const view = await readClientWorkoutView(client, base);
    expect(view.status).toBe('ok');
    expect(client.calls.map(([name]) => name)).toEqual([
      'client_portal_workout_plan',
    ]);
  });

  it('pdf returns the shared F17 payload for the print view and audits success identity-only', async () => {
    const client = fakeClient(rawOk());
    const result = await exportClientWorkoutPlan(client, {
      ...base,
      format: 'pdf',
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok' || result.format !== 'pdf') throw new Error();
    expect(result.revisionNumber).toBe(2);
    expect(result.payload.days[0]!.items[0]!.videoUrl).toBe(BENCH_URL);
    expect(client.calls.map(([name]) => name)).toEqual([
      'client_portal_workout_plan',
      'record_workout_export_audit',
    ]);
    expect(client.calls[1]![1]).toEqual({
      p_workspace_id: WORKSPACE_ID,
      p_plan_id: PLAN_ID,
      p_revision_id: REVISION_ID,
      p_format: 'pdf',
      p_outcome: 'success',
      p_reason: null,
    });
  });

  it('excel returns the F17 workbook for the selected revision with every cell text and formulas neutralized', async () => {
    const raw = rawOk();
    raw.document.days[0]!.items![0]!.notes = '=HYPERLINK("http://evil","x")';
    const client = fakeClient(raw);
    const result = await exportClientWorkoutPlan(client, {
      ...base,
      format: 'excel',
    });
    if (result.status !== 'ok' || result.format !== 'excel') throw new Error();
    expect(result.filename).toBe('workout-plan-r2.xlsx');
    expect(result.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.body as never);
    const cells: string[] = [];
    workbook.worksheets[0]!.eachRow((row) =>
      row.eachCell((cell) => {
        expect(typeof cell.value === 'object' && cell.value !== null).toBe(
          false,
        );
        expect(cell.numFmt).toBe('@');
        cells.push(String(cell.value ?? ''));
      }),
    );
    expect(cells).toContain('Bench Press');
    expect(cells).toContain(`${BENCH_URL}\n${PRIVATE_URL}`);
    expect(cells).toContain('=HYPERLINK("http://evil","x")');
    expect(client.calls[1]![1]).toMatchObject({
      p_format: 'excel',
      p_outcome: 'success',
    });
  });

  it('is denied and audited as a denial when F13 restricts the client; no content is returned', async () => {
    const client = fakeClient({
      status: 'restricted',
      subscription: {
        status: 'expired',
        effective_end_exclusive: '2026-01-01',
      },
    });
    const result = await exportClientWorkoutPlan(client, {
      ...base,
      format: 'excel',
    });
    expect(result).toEqual({ status: 'denied' });
    expect(client.calls[1]).toEqual([
      'record_workout_export_audit',
      {
        p_workspace_id: null,
        p_plan_id: PLAN_ID,
        p_revision_id: null,
        p_format: 'excel',
        p_outcome: 'denied',
        p_reason: 'not_permitted',
      },
    ]);
  });

  it('denies not_found with the not_found reason and stays denied when the audit sink is down', async () => {
    const client = fakeClient({ status: 'not_found' }, { auditThrows: true });
    expect(
      await exportClientWorkoutPlan(client, { ...base, format: 'pdf' }),
    ).toEqual({ status: 'denied' });
    expect(client.calls[1]![1]).toMatchObject({
      p_outcome: 'denied',
      p_reason: 'not_found',
    });
  });

  it('fails closed: no file or payload is released when the success audit fails', async () => {
    for (const format of ['pdf', 'excel'] as const) {
      expect(
        await exportClientWorkoutPlan(
          fakeClient(rawOk(), { auditError: true }),
          { ...base, format },
        ),
      ).toEqual({ status: 'denied' });
      expect(
        await exportClientWorkoutPlan(
          fakeClient(rawOk(), { auditThrows: true }),
          { ...base, format },
        ),
      ).toEqual({ status: 'denied' });
    }
  });

  it('never sends client, workspace or entitlement identifiers to the read', async () => {
    const client = fakeClient(rawOk());
    await exportClientWorkoutPlan(client, { ...base, format: 'pdf' });
    expect(client.calls[0]).toEqual([
      'client_portal_workout_plan',
      { p_plan_id: PLAN_ID, p_revision_number: 2 },
    ]);
  });
});

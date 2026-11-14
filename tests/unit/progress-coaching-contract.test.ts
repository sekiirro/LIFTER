import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseAdherenceValue,
  parseMeasurementBaselineRow,
  parseWeeklyAdherenceRow,
  readMeasurementBaselines,
  readMeasurementHistory,
  readWeeklyAdherence,
} from '../../lib/progress-coaching/contract';

const ws = '6f1c0b9e-2d4a-4c1e-9b3a-1f2e3d4c5b6a';
const client = '0b8d7c6e-5f4a-4b3c-8d2e-1a0b9c8d7e6f';
const assignment = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function rpcClient(result: { data: unknown; error: { code?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('spec 024 adherence contract', () => {
  it('accepts only 0-10 integers as adherence values', () => {
    expect(parseAdherenceValue(0)).toBe(0);
    expect(parseAdherenceValue(10)).toBe(10);
    expect(parseAdherenceValue(7)).toBe(7);
    expect(parseAdherenceValue(11)).toBeNull();
    expect(parseAdherenceValue(-1)).toBeNull();
    expect(parseAdherenceValue(4.5)).toBeNull();
    expect(parseAdherenceValue('7')).toBeNull();
    expect(parseAdherenceValue(null)).toBeNull();
  });

  it('maps the exact workoutAdherence/dietAdherence field names', () => {
    expect(
      parseWeeklyAdherenceRow({
        client_id: client,
        assignment_id: assignment,
        checkin_date: '2026-11-21',
        submitted_at: '2026-11-21T08:00:00+00:00',
        workoutAdherence: 8,
        dietAdherence: null,
      }),
    ).toEqual({
      clientId: client,
      assignmentId: assignment,
      checkinDate: '2026-11-21',
      submittedAt: '2026-11-21T08:00:00+00:00',
      workoutAdherence: 8,
      dietAdherence: null,
    });
  });

  it('calls the workspace-scoped RPC and fails closed on malformed rows', async () => {
    const ok = rpcClient({
      data: [
        {
          client_id: client,
          assignment_id: assignment,
          checkin_date: '2026-11-21',
          submitted_at: '2026-11-21T08:00:00+00:00',
          workoutAdherence: 6,
          dietAdherence: 9,
        },
      ],
      error: null,
    });
    const result = await readWeeklyAdherence(ok.client, {
      workspaceId: ws,
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(ok.rpc).toHaveBeenCalledWith('progress_weekly_adherence', {
      p_workspace_id: ws,
      p_from: '2026-11-01',
      p_to: '2026-11-30',
    });
    expect(result).toMatchObject({
      status: 'ok',
      rows: [{ dietAdherence: 9 }],
    });

    const drifted = rpcClient({ data: [{ client_id: 'x' }], error: null });
    expect(
      await readWeeklyAdherence(drifted.client, {
        workspaceId: ws,
        from: '2026-11-01',
        to: '2026-11-30',
      }),
    ).toEqual({ status: 'unavailable' });
  });

  it('maps database denial and rejects invalid windows without a call', async () => {
    const denied = rpcClient({ data: null, error: { code: '42501' } });
    expect(
      await readMeasurementHistory(denied.client, {
        workspaceId: ws,
        from: '2026-11-01',
        to: '2026-11-30',
      }),
    ).toEqual({ status: 'denied' });
    const unused = rpcClient({ data: [], error: null });
    expect(
      await readWeeklyAdherence(unused.client, {
        workspaceId: ws,
        from: '2026-11-30',
        to: '2026-11-01',
      }),
    ).toEqual({ status: 'invalid_input' });
    expect(
      await readMeasurementBaselines(unused.client, {
        workspaceId: 'not-a-uuid',
        asOf: '2026-11-30',
      }),
    ).toEqual({ status: 'invalid_input' });
    expect(unused.rpc).not.toHaveBeenCalled();
  });

  it('parses baseline rows with numeric strings from PostgREST', () => {
    expect(
      parseMeasurementBaselineRow({
        client_id: client,
        measurement_type: 'bodyWeight',
        baseline_value: '92.5',
        baseline_unit_en: 'kg',
        baseline_unit_ar: 'كجم',
        baseline_recorded_on: '2026-11-07',
        latest_value: 90,
        latest_unit_en: 'kg',
        latest_unit_ar: 'كجم',
        latest_recorded_on: '2026-11-21',
        measurement_count: 3,
      }),
    ).toMatchObject({
      baselineValue: 92.5,
      latestValue: 90,
      measurementCount: 3,
    });
    expect(
      parseMeasurementBaselineRow({ client_id: client, measurement_count: 0 }),
    ).toBeNull();
  });
});

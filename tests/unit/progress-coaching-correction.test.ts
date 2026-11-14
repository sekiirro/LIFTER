import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  createSessionClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ getActor: mocks.getActor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));

import {
  parseCorrectionInput,
  parseMeasurementValue,
} from '../../lib/progress-coaching/correction-input';
import { correctMeasurement } from '../../lib/progress-coaching/service';

const WS = '10000000-0000-4000-8000-000000000001';
const FOREIGN_WS = '10000000-0000-4000-8000-000000000002';
const CLIENT = '20000000-0000-4000-8000-000000000001';
const MEASUREMENT = '30000000-0000-4000-8000-000000000001';
// Microsecond precision must survive untouched (optimistic concurrency).
const VERSION = '2026-11-14T10:15:30.123456+02:00';

const valid = {
  workspaceId: WS,
  clientId: CLIENT,
  measurementId: MEASUREMENT,
  value: 91.5,
  expectedUpdatedAt: VERSION,
};

describe('measurement value parsing (FR-013 correction input)', () => {
  it('accepts Latin and Arabic-Indic digits with either decimal separator', () => {
    expect(parseMeasurementValue('91.5')).toBe(91.5);
    expect(parseMeasurementValue(' ٩١٫٥ ')).toBe(91.5);
    expect(parseMeasurementValue('۹۱.۵')).toBe(91.5);
    expect(parseMeasurementValue('-3')).toBe(-3);
  });

  it('rejects anything that is not a plain finite decimal inside the stored bounds', () => {
    for (const raw of [
      '',
      'abc',
      '1e3',
      'Infinity',
      '0x10',
      '1,5',
      '1000000',
      '-1000000',
      '1.1234567',
    ])
      expect(parseMeasurementValue(raw), raw).toBeNull();
  });
});

describe('correction input parsing', () => {
  it('keeps the version string verbatim', () => {
    expect(parseCorrectionInput(valid)).toEqual(valid);
  });

  it('rejects malformed ids, values and versions', () => {
    for (const patch of [
      { workspaceId: 'not-a-uuid' },
      { clientId: 7 },
      { measurementId: undefined },
      { value: Number.NaN },
      { value: '91' },
      { value: 1_000_000 },
      { expectedUpdatedAt: 'yesterday' },
      { expectedUpdatedAt: 'x'.repeat(65) },
    ])
      expect(parseCorrectionInput({ ...valid, ...patch })).toBeNull();
    expect(parseCorrectionInput(null)).toBeNull();
    expect(parseCorrectionInput([valid])).toBeNull();
  });
});

describe('correctMeasurement authorization (app-layer wall, FR-013)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({
      data: { status: 'corrected' },
      error: null,
    });
    mocks.createSessionClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it('lets a workspace trainer correct and forwards the version as text', async () => {
    mocks.getActor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [WS],
    });
    await expect(correctMeasurement(valid)).resolves.toEqual({
      status: 'corrected',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('correct_progress_measurement', {
      p_workspace_id: WS,
      p_measurement_id: MEASUREMENT,
      p_value: 91.5,
      p_expected_updated_at: VERSION,
    });
  });

  it.each([
    ['Sales', { role: 'sales', activeWorkspaceIds: [WS] }],
    [
      'a foreign-workspace trainer',
      { role: 'trainer', activeWorkspaceIds: [FOREIGN_WS] },
    ],
    ['a role-less session', { role: null, activeWorkspaceIds: [WS] }],
  ])('denies %s without calling the database', async (_label, actor) => {
    mocks.getActor.mockResolvedValue({ userId: 'someone', ...actor });
    await expect(correctMeasurement(valid)).resolves.toEqual({
      status: 'denied',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('denies a signed-out caller', async () => {
    mocks.getActor.mockResolvedValue(null);
    await expect(correctMeasurement(valid)).resolves.toEqual({
      status: 'denied',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects invalid input before resolving the actor', async () => {
    await expect(correctMeasurement({ ...valid, value: 'x' })).resolves.toEqual(
      { status: 'invalid' },
    );
    expect(mocks.getActor).not.toHaveBeenCalled();
  });

  it('maps a database wall denial and an unknown status fail-closed', async () => {
    mocks.getActor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: [WS],
    });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    await expect(correctMeasurement(valid)).resolves.toEqual({
      status: 'denied',
    });
    mocks.rpc.mockResolvedValueOnce({ data: { status: 'weird' }, error: null });
    await expect(correctMeasurement(valid)).resolves.toEqual({
      status: 'unavailable',
    });
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'conflict' },
      error: null,
    });
    await expect(correctMeasurement(valid)).resolves.toEqual({
      status: 'conflict',
    });
  });
});

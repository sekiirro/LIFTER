import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  createSessionClient: vi.fn(),
  authorizeClientAccess: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ getActor: mocks.getActor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));
vi.mock('../../lib/client-access/authorize', () => ({
  authorizeClientAccess: mocks.authorizeClientAccess,
}));

import {
  configureCheckinForm,
  readCheckinConfiguration,
} from '../../lib/progress-coaching/checkins/configuration';
import { parseCheckinConfiguration } from '../../lib/progress-coaching/checkins/configuration-types';
import {
  parseOwnEditInput,
  parseOwnEntryInput,
} from '../../lib/progress-coaching/correction-input';
import {
  readClientSelfProgress,
  recordOwnMeasurement,
  updateOwnMeasurement,
} from '../../lib/progress-coaching/service';

const WS = '10000000-0000-4000-8000-000000000001';
const FOREIGN_WS = '10000000-0000-4000-8000-000000000002';
const CLIENT = '20000000-0000-4000-8000-000000000001';
const MEASUREMENT = '30000000-0000-4000-8000-000000000001';
const FORM = '40000000-0000-4000-8000-000000000001';
const VERSION = '2026-11-14T10:15:30.123456+02:00';

const entry = {
  workspaceId: WS,
  clientId: CLIENT,
  measurementType: 'bodyWeight',
  value: 92.5,
  recordedOn: '2026-11-13',
};
const edit = {
  workspaceId: WS,
  measurementId: MEASUREMENT,
  value: 92,
  expectedUpdatedAt: VERSION,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
  vi.clearAllMocks();
  mocks.createSessionClient.mockResolvedValue({ rpc: mocks.rpc });
  mocks.authorizeClientAccess.mockResolvedValue({
    allowed: true,
    approvalState: 'approved',
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('client entry/edit input parsing', () => {
  it('refuses dates far in the past so they cannot become the spec 024 baseline (A1)', () => {
    for (const recordedOn of ['0001-01-01', '1999-12-31', '2025-01-01'])
      expect(parseOwnEntryInput({ ...entry, recordedOn })).toBeNull();
    expect(
      parseOwnEntryInput({ ...entry, recordedOn: '2025-11-20' }),
    ).not.toBeNull();
  });

  it('accepts well-formed input and rejects malformed fields', () => {
    expect(parseOwnEntryInput(entry)).toEqual(entry);
    expect(parseOwnEditInput(edit)).toEqual(edit);
    for (const patch of [
      { workspaceId: 'x' },
      { clientId: null },
      { measurementType: 'body weight' },
      { measurementType: 'x'.repeat(65) },
      { value: '92' },
      { value: Number.POSITIVE_INFINITY },
      { recordedOn: '13/11/2026' },
      { recordedOn: '2026-13-45' },
    ])
      expect(parseOwnEntryInput({ ...entry, ...patch })).toBeNull();
    for (const patch of [
      { measurementId: 'x' },
      { value: 1_000_000 },
      { expectedUpdatedAt: 'later' },
    ])
      expect(parseOwnEditInput({ ...edit, ...patch })).toBeNull();
  });
});

describe('client measurement writes (app-layer client wall)', () => {
  it('records and edits through the client-only RPCs', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'recorded', measurement_id: MEASUREMENT },
      error: null,
    });
    await expect(recordOwnMeasurement(entry)).resolves.toEqual({
      status: 'recorded',
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith('record_progress_measurement', {
      p_workspace_id: WS,
      p_client_id: CLIENT,
      p_measurement_type: 'bodyWeight',
      p_value: 92.5,
      p_recorded_on: '2026-11-13',
    });
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'updated', updated_at: VERSION },
      error: null,
    });
    await expect(updateOwnMeasurement(edit)).resolves.toEqual({
      status: 'updated',
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'update_own_progress_measurement',
      {
        p_workspace_id: WS,
        p_measurement_id: MEASUREMENT,
        p_value: 92,
        p_expected_updated_at: VERSION,
      },
    );
  });

  it('maps duplicate, not-editable and wall denials; fails closed otherwise', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'duplicate_same_day', measurement_id: MEASUREMENT },
      error: null,
    });
    await expect(recordOwnMeasurement(entry)).resolves.toEqual({
      status: 'duplicate_same_day',
    });
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'not_editable' },
      error: null,
    });
    await expect(updateOwnMeasurement(edit)).resolves.toEqual({
      status: 'not_editable',
    });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    await expect(updateOwnMeasurement(edit)).resolves.toEqual({
      status: 'denied',
    });
    // A client RPC never yields a staff-only status.
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'corrected' },
      error: null,
    });
    await expect(updateOwnMeasurement(edit)).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it.each(['pending-approval', 'rejected', 'not_permitted'] as const)(
    'denies a %s session without calling the database',
    async (status) => {
      mocks.authorizeClientAccess.mockResolvedValue({ allowed: false, status });
      await expect(recordOwnMeasurement(entry)).resolves.toEqual({
        status: 'denied',
      });
      await expect(updateOwnMeasurement(edit)).resolves.toEqual({
        status: 'denied',
      });
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid input before checking access', async () => {
    await expect(
      recordOwnMeasurement({ ...entry, value: 'x' }),
    ).resolves.toEqual({ status: 'invalid' });
    expect(mocks.authorizeClientAccess).not.toHaveBeenCalled();
  });
});

describe('client self progress entry options', () => {
  it('parses own ids, today and entry types; hides types when restricted', async () => {
    const base = {
      status: 'ok',
      measurements_status: 'ok',
      measurements: [],
      timeline: [],
      workspace_id: WS,
      client_id: CLIENT,
      today: '2026-11-14',
      entry_types: [
        {
          id: 'bodyWeight',
          label: { en: 'Body weight', ar: 'الوزن' },
          unit_en: 'kg',
          unit_ar: 'كجم',
          min: 20,
          max: 400,
          step: null,
        },
      ],
    };
    mocks.rpc.mockResolvedValueOnce({ data: base, error: null });
    await expect(readClientSelfProgress()).resolves.toMatchObject({
      status: 'ok',
      workspaceId: WS,
      clientId: CLIENT,
      today: '2026-11-14',
      entryTypes: [
        {
          id: 'bodyWeight',
          label: { en: 'Body weight', ar: 'الوزن' },
          unitEn: 'kg',
          unitAr: 'كجم',
          min: 20,
          max: 400,
          step: null,
        },
      ],
    });
    mocks.rpc.mockResolvedValueOnce({
      data: { ...base, measurements_status: 'restricted' },
      error: null,
    });
    await expect(readClientSelfProgress()).resolves.toMatchObject({
      measurementsVisible: false,
      entryTypes: [],
    });
    mocks.rpc.mockResolvedValueOnce({
      data: { ...base, client_id: 'not-a-uuid' },
      error: null,
    });
    await expect(readClientSelfProgress()).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('weekly check-in configuration (app-layer wall: assign_intake_form)', () => {
  const trainer = {
    userId: 'trainer',
    role: 'trainer',
    activeWorkspaceIds: [WS],
  };

  it('reads and configures for a workspace trainer', async () => {
    mocks.getActor.mockResolvedValue(trainer);
    mocks.rpc.mockResolvedValueOnce({
      data: {
        status: 'ok',
        current: null,
        forms: [
          {
            form_id: FORM,
            name: 'Weekly',
            title: null,
            version_number: 2,
            valid: true,
          },
        ],
      },
      error: null,
    });
    await expect(readCheckinConfiguration(WS)).resolves.toEqual({
      status: 'ok',
      current: null,
      forms: [
        {
          formId: FORM,
          name: 'Weekly',
          title: null,
          versionNumber: 2,
          valid: true,
        },
      ],
    });
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'conflict' },
      error: null,
    });
    await expect(
      configureCheckinForm({ workspaceId: WS, formId: FORM, versionNumber: 2 }),
    ).resolves.toEqual({ status: 'conflict' });
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'configure_weekly_checkin_form',
      { p_workspace_id: WS, p_form_id: FORM, p_version_number: 2 },
    );
  });

  it.each([
    ['Sales', { role: 'sales', activeWorkspaceIds: [WS] }],
    [
      'a foreign-workspace trainer',
      { role: 'trainer', activeWorkspaceIds: [FOREIGN_WS] },
    ],
  ])('denies %s without calling the database', async (_label, actor) => {
    mocks.getActor.mockResolvedValue({ userId: 'someone', ...actor });
    await expect(readCheckinConfiguration(WS)).resolves.toEqual({
      status: 'denied',
    });
    await expect(
      configureCheckinForm({ workspaceId: WS, formId: FORM, versionNumber: 1 }),
    ).resolves.toEqual({ status: 'denied' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects malformed configure input and malformed reads', async () => {
    mocks.getActor.mockResolvedValue(trainer);
    for (const input of [
      null,
      { workspaceId: WS, formId: 'x', versionNumber: 1 },
      { workspaceId: WS, formId: FORM, versionNumber: 0 },
      { workspaceId: WS, formId: FORM, versionNumber: 1.5 },
    ])
      await expect(configureCheckinForm(input)).resolves.toEqual({
        status: 'invalid',
      });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(
      parseCheckinConfiguration({ status: 'ok', current: null, forms: [{}] }),
    ).toEqual({ status: 'unavailable' });
    expect(
      parseCheckinConfiguration({
        status: 'ok',
        current: { form_id: FORM, version_number: 3 },
        forms: [],
      }),
    ).toEqual({
      status: 'ok',
      current: { formId: FORM, versionNumber: 3 },
      forms: [],
    });
  });
});

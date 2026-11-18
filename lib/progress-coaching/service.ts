import 'server-only';
import { getActor } from '../auth/actor';
import { authorizeClientAccess } from '../client-access/authorize';
import { authorize } from '../auth/authorize';
import { createSessionClient } from '../supabase/server';
import { isUuid } from '../client-notes/validation';
import {
  parseCorrectionInput,
  parseOwnEditInput,
  parseOwnEntryInput,
  type MeasurementWriteResult,
  type MeasurementWriteStatus,
} from './correction-input';
import {
  parseEntryType,
  parseList,
  parseMeasurement,
  parseTimelineEvent,
  sortTimeline,
} from './parse';
import type {
  MeasurementEntryType,
  ProgressMeasurement,
  ProgressStatus,
  TimelineEvent,
} from './types';

type StaffTarget = { workspaceId: string; clientId: string };

export type StaffProgressResult =
  | {
      status: 'ok';
      measurements: ProgressMeasurement[];
      timeline: TimelineEvent[];
    }
  | { status: ProgressStatus };

export type ClientProgressResult =
  | {
      status: 'ok';
      /** False when F13 plan access is restricted (expired/awaiting activation). */
      measurementsVisible: boolean;
      measurements: ProgressMeasurement[];
      timeline: TimelineEvent[];
      /** Own ids and entry options for manual add/edit (PO 2026-11-14). */
      workspaceId: string;
      clientId: string;
      today: string;
      entryTypes: MeasurementEntryType[];
    }
  | { status: ProgressStatus };

export type CorrectionResult = MeasurementWriteResult;

// Database walls raise 42501 for any unauthorized or foreign-workspace caller.
const isDenial = (error: { code?: string } | null) => error?.code === '42501';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

async function staffSession(target: StaffTarget) {
  if (!isUuid(target.workspaceId) || !isUuid(target.clientId)) return null;
  const actor = await getActor();
  // App-layer wall; the database re-checks has_workspace_access(coaching_work).
  if (!actor || !authorize(actor, 'coaching_work', target.workspaceId))
    return null;
  return createSessionClient();
}

export async function readStaffClientProgress(
  target: StaffTarget,
): Promise<StaffProgressResult> {
  const session = await staffSession(target);
  if (!session) return { status: 'denied' };
  const args = {
    p_workspace_id: target.workspaceId,
    p_client_id: target.clientId,
  };
  const [measurements, timeline] = await Promise.all([
    session.rpc('list_progress_measurements', args),
    session.rpc('client_progress_timeline', args),
  ]);
  if (measurements.error || timeline.error)
    return {
      status: [measurements.error, timeline.error].some(isDenial)
        ? 'denied'
        : 'unavailable',
    };
  const m = record(measurements.data);
  const t = record(timeline.data);
  if (m.status !== 'ok' || t.status !== 'ok') return { status: 'not_found' };
  const parsedMeasurements = parseList(m.measurements, parseMeasurement);
  const parsedTimeline = parseList(t.events, parseTimelineEvent);
  if (!parsedMeasurements || !parsedTimeline) return { status: 'unavailable' };
  return {
    status: 'ok',
    measurements: parsedMeasurements,
    timeline: sortTimeline(parsedTimeline),
  };
}

export async function readClientSelfProgress(): Promise<ClientProgressResult> {
  const session = await createSessionClient();
  if (!session) return { status: 'unavailable' };
  const result = await session.rpc('client_self_progress');
  if (result.error)
    return { status: isDenial(result.error) ? 'not_found' : 'unavailable' };
  const data = record(result.data);
  if (data.status !== 'ok') return { status: 'not_found' };
  const measurementsVisible = data.measurements_status === 'ok';
  const measurements = parseList(data.measurements, parseMeasurement);
  const timeline = parseList(data.timeline, parseTimelineEvent);
  const entryTypes = parseList(data.entry_types ?? [], parseEntryType);
  const { workspace_id: workspaceId, client_id: clientId, today } = data;
  if (
    !measurements ||
    !timeline ||
    !entryTypes ||
    !isUuid(workspaceId) ||
    !isUuid(clientId) ||
    typeof today !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(today)
  )
    return { status: 'unavailable' };
  return {
    status: 'ok',
    measurementsVisible,
    measurements: measurementsVisible ? measurements : [],
    timeline: sortTimeline(timeline),
    workspaceId,
    clientId,
    today,
    entryTypes: measurementsVisible ? entryTypes : [],
  };
}

/** FR-013 trainer correction; `raw` is untrusted server-action input. */
export async function correctMeasurement(
  raw: unknown,
): Promise<CorrectionResult> {
  const input = parseCorrectionInput(raw);
  if (!input) return { status: 'invalid' };
  const session = await staffSession(input);
  if (!session) return { status: 'denied' };
  const result = await session.rpc('correct_progress_measurement', {
    p_workspace_id: input.workspaceId,
    p_measurement_id: input.measurementId,
    p_value: input.value,
    p_expected_updated_at: input.expectedUpdatedAt,
  });
  return mapWrite(result, [
    'corrected',
    'unchanged',
    'conflict',
    'invalid',
    'not_found',
  ]);
}

type RpcResult = { data: unknown; error: { code?: string } | null };

function mapWrite(
  result: RpcResult,
  allowed: readonly MeasurementWriteStatus[],
): MeasurementWriteResult {
  if (result.error)
    return { status: isDenial(result.error) ? 'denied' : 'unavailable' };
  const status = record(result.data).status;
  return typeof status === 'string' &&
    (allowed as readonly string[]).includes(status)
    ? { status: status as MeasurementWriteStatus }
    : { status: 'unavailable' };
}

/** App-layer client wall; the RPCs re-check the client and F13 plan access. */
async function clientSession() {
  const access = await authorizeClientAccess();
  if (!access.allowed) return null;
  return createSessionClient();
}

/** FR-012/FR-015 client manual entry; `raw` is untrusted action input. */
export async function recordOwnMeasurement(
  raw: unknown,
): Promise<MeasurementWriteResult> {
  const input = parseOwnEntryInput(raw);
  if (!input) return { status: 'invalid' };
  const session = await clientSession();
  if (!session) return { status: 'denied' };
  const result = await session.rpc('record_progress_measurement', {
    p_workspace_id: input.workspaceId,
    p_client_id: input.clientId,
    p_measurement_type: input.measurementType,
    p_value: input.value,
    p_recorded_on: input.recordedOn,
  });
  return mapWrite(result, ['recorded', 'duplicate_same_day', 'invalid']);
}

/** PO 2026-11-14 "Add + edit own": the client edits an own manual row in place. */
export async function updateOwnMeasurement(
  raw: unknown,
): Promise<MeasurementWriteResult> {
  const input = parseOwnEditInput(raw);
  if (!input) return { status: 'invalid' };
  const session = await clientSession();
  if (!session) return { status: 'denied' };
  const result = await session.rpc('update_own_progress_measurement', {
    p_workspace_id: input.workspaceId,
    p_measurement_id: input.measurementId,
    p_value: input.value,
    p_expected_updated_at: input.expectedUpdatedAt,
  });
  return mapWrite(result, [
    'updated',
    'unchanged',
    'conflict',
    'not_editable',
    'invalid',
    'not_found',
  ]);
}

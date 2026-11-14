import 'server-only';
import { getActor } from '../auth/actor';
import { authorize } from '../auth/authorize';
import { createSessionClient } from '../supabase/server';
import { isUuid } from '../client-notes/validation';
import {
  parseList,
  parseMeasurement,
  parseTimelineEvent,
  sortTimeline,
} from './parse';
import type {
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
    }
  | { status: ProgressStatus };

export type CorrectionResult = {
  status: 'corrected' | 'unchanged' | 'conflict' | 'invalid' | ProgressStatus;
};

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
  if (!measurements || !timeline) return { status: 'unavailable' };
  return {
    status: 'ok',
    measurementsVisible,
    measurements: measurementsVisible ? measurements : [],
    timeline: sortTimeline(timeline),
  };
}

export async function correctMeasurement(input: {
  workspaceId: string;
  clientId: string;
  measurementId: string;
  value: number;
  expectedUpdatedAt: string;
}): Promise<CorrectionResult> {
  if (
    !isUuid(input.measurementId) ||
    !Number.isFinite(input.value) ||
    Number.isNaN(Date.parse(input.expectedUpdatedAt))
  )
    return { status: 'invalid' };
  const session = await staffSession(input);
  if (!session) return { status: 'denied' };
  const result = await session.rpc('correct_progress_measurement', {
    p_workspace_id: input.workspaceId,
    p_measurement_id: input.measurementId,
    p_value: input.value,
    p_expected_updated_at: input.expectedUpdatedAt,
  });
  if (result.error)
    return { status: isDenial(result.error) ? 'denied' : 'unavailable' };
  const status = record(result.data).status;
  if (
    status === 'corrected' ||
    status === 'unchanged' ||
    status === 'conflict' ||
    status === 'invalid' ||
    status === 'not_found'
  )
    return { status };
  return { status: 'unavailable' };
}

/**
 * Spec 023 -> spec 024 read-only data contract.
 *
 * Database objects (all workspace-scoped, read-only, SECURITY DEFINER with a
 * single wall: app_private.has_workspace_access(workspace, 'coaching_work'), i.e.
 * a platform owner, workspace owner or trainer with an active membership. There is
 * no database-owner or service_role bypass; everyone else gets 42501 or has no
 * EXECUTE. Adherence comes from the private store
 * app_private.progress_checkin_adherence, never from raw F15 answers):
 *   - public.progress_weekly_adherence(p_workspace_id uuid, p_from date, p_to date)
 *   - public.progress_measurement_history(p_workspace_id uuid, p_from date, p_to date)
 *   - public.progress_measurement_baselines(p_workspace_id uuid, p_as_of date)
 *
 * These readers only parse and type the rows; they never compute leaderboard
 * scores (spec 024 owns scoring; spec 023 FR-038).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const ADHERENCE_MIN = 0;
export const ADHERENCE_MAX = 10;

/** 0-10 integer, or null when the client left the question unanswered. */
export type AdherenceValue = number | null;

export type WeeklyAdherenceRow = {
  clientId: string;
  assignmentId: string;
  /** Cairo date the weekly check-in occurrence was due (YYYY-MM-DD). */
  checkinDate: string;
  submittedAt: string;
  workoutAdherence: AdherenceValue;
  dietAdherence: AdherenceValue;
};

export type MeasurementHistoryRow = {
  clientId: string;
  measurementId: string;
  /** F15 weekly check-in question id the value was mapped from. */
  measurementType: string;
  value: number;
  unitEn: string | null;
  unitAr: string | null;
  recordedOn: string;
  sourceKind: 'checkin' | 'manual';
  sourceAssignmentId: string | null;
};

export type MeasurementBaselineRow = {
  clientId: string;
  measurementType: string;
  baselineValue: number;
  baselineUnitEn: string | null;
  baselineUnitAr: string | null;
  baselineRecordedOn: string;
  latestValue: number;
  latestUnitEn: string | null;
  latestUnitAr: string | null;
  latestRecordedOn: string;
  measurementCount: number;
};

export type ContractResult<T> =
  | { status: 'ok'; rows: T[] }
  | { status: 'denied' | 'invalid_input' | 'unavailable' };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}
function date(value: unknown): string | null {
  return typeof value === 'string' && DATE.test(value) ? value : null;
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function finite(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function parseAdherenceValue(value: unknown): AdherenceValue {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= ADHERENCE_MIN &&
    value <= ADHERENCE_MAX
    ? value
    : null;
}

export function parseWeeklyAdherenceRow(
  raw: unknown,
): WeeklyAdherenceRow | null {
  if (!isRecord(raw)) return null;
  const clientId = uuid(raw.client_id);
  const assignmentId = uuid(raw.assignment_id);
  const checkinDate = date(raw.checkin_date);
  const submittedAt = text(raw.submitted_at);
  if (!clientId || !assignmentId || !checkinDate || !submittedAt) return null;
  return {
    clientId,
    assignmentId,
    checkinDate,
    submittedAt,
    workoutAdherence: parseAdherenceValue(raw.workoutAdherence),
    dietAdherence: parseAdherenceValue(raw.dietAdherence),
  };
}

export function parseMeasurementHistoryRow(
  raw: unknown,
): MeasurementHistoryRow | null {
  if (!isRecord(raw)) return null;
  const clientId = uuid(raw.client_id);
  const measurementId = uuid(raw.measurement_id);
  const measurementType = text(raw.measurement_type);
  const value = finite(raw.value);
  const recordedOn = date(raw.recorded_on);
  const sourceKind = raw.source_kind;
  if (
    !clientId ||
    !measurementId ||
    !measurementType ||
    value === null ||
    !recordedOn ||
    (sourceKind !== 'checkin' && sourceKind !== 'manual')
  )
    return null;
  return {
    clientId,
    measurementId,
    measurementType,
    value,
    unitEn: text(raw.unit_en),
    unitAr: text(raw.unit_ar),
    recordedOn,
    sourceKind,
    sourceAssignmentId: uuid(raw.source_assignment_id),
  };
}

export function parseMeasurementBaselineRow(
  raw: unknown,
): MeasurementBaselineRow | null {
  if (!isRecord(raw)) return null;
  const clientId = uuid(raw.client_id);
  const measurementType = text(raw.measurement_type);
  const baselineValue = finite(raw.baseline_value);
  const latestValue = finite(raw.latest_value);
  const baselineRecordedOn = date(raw.baseline_recorded_on);
  const latestRecordedOn = date(raw.latest_recorded_on);
  const measurementCount = finite(raw.measurement_count);
  if (
    !clientId ||
    !measurementType ||
    baselineValue === null ||
    latestValue === null ||
    !baselineRecordedOn ||
    !latestRecordedOn ||
    measurementCount === null ||
    !Number.isInteger(measurementCount) ||
    measurementCount < 1
  )
    return null;
  return {
    clientId,
    measurementType,
    baselineValue,
    baselineUnitEn: text(raw.baseline_unit_en),
    baselineUnitAr: text(raw.baseline_unit_ar),
    baselineRecordedOn,
    latestValue,
    latestUnitEn: text(raw.latest_unit_en),
    latestUnitAr: text(raw.latest_unit_ar),
    latestRecordedOn,
    measurementCount,
  };
}

function mapError(
  error: { code?: string } | null,
): 'denied' | 'invalid_input' | 'unavailable' {
  if (error?.code === '42501') return 'denied';
  if (error?.code === '22023') return 'invalid_input';
  return 'unavailable';
}

function parseRows<T>(
  data: unknown,
  parse: (raw: unknown) => T | null,
): ContractResult<T> {
  if (!Array.isArray(data)) return { status: 'unavailable' };
  const rows: T[] = [];
  for (const raw of data) {
    const row = parse(raw);
    // Fail closed: a malformed row means the contract drifted.
    if (!row) return { status: 'unavailable' };
    rows.push(row);
  }
  return { status: 'ok', rows };
}

function validWindow(from: string, to: string): boolean {
  return DATE.test(from) && DATE.test(to) && from <= to;
}

export async function readWeeklyAdherence(
  client: SupabaseClient,
  input: { workspaceId: string; from: string; to: string },
): Promise<ContractResult<WeeklyAdherenceRow>> {
  if (!uuid(input.workspaceId) || !validWindow(input.from, input.to))
    return { status: 'invalid_input' };
  const result = await client.rpc('progress_weekly_adherence', {
    p_workspace_id: input.workspaceId,
    p_from: input.from,
    p_to: input.to,
  });
  if (result.error) return { status: mapError(result.error) };
  return parseRows(result.data, parseWeeklyAdherenceRow);
}

export async function readMeasurementHistory(
  client: SupabaseClient,
  input: { workspaceId: string; from: string; to: string },
): Promise<ContractResult<MeasurementHistoryRow>> {
  if (!uuid(input.workspaceId) || !validWindow(input.from, input.to))
    return { status: 'invalid_input' };
  const result = await client.rpc('progress_measurement_history', {
    p_workspace_id: input.workspaceId,
    p_from: input.from,
    p_to: input.to,
  });
  if (result.error) return { status: mapError(result.error) };
  return parseRows(result.data, parseMeasurementHistoryRow);
}

export async function readMeasurementBaselines(
  client: SupabaseClient,
  input: { workspaceId: string; asOf: string },
): Promise<ContractResult<MeasurementBaselineRow>> {
  if (!uuid(input.workspaceId) || !DATE.test(input.asOf))
    return { status: 'invalid_input' };
  const result = await client.rpc('progress_measurement_baselines', {
    p_workspace_id: input.workspaceId,
    p_as_of: input.asOf,
  });
  if (result.error) return { status: mapError(result.error) };
  return parseRows(result.data, parseMeasurementBaselineRow);
}

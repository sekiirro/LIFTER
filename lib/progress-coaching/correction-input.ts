import { isUuid } from '../client-notes/validation';

/** Staff correction request (FR-013), parsed from untrusted server-action input. */
export type CorrectionInput = {
  workspaceId: string;
  clientId: string;
  measurementId: string;
  value: number;
  /** Opaque database version, forwarded as text to keep microsecond precision. */
  expectedUpdatedAt: string;
};

/** Same open bounds as the `progress_measurements.value` check constraint. */
export const MEASUREMENT_VALUE_LIMIT = 1_000_000;

const ARABIC_INDIC = /[٠-٩۰-۹]/g;

/**
 * Parses a typed measurement value. Arabic-Indic digits and the Arabic decimal
 * separator are accepted so Arabic keyboards work; anything that is not a plain
 * finite decimal inside the stored bounds is rejected.
 */
export function parseMeasurementValue(raw: string): number | null {
  const normalized = raw
    .trim()
    .replace(ARABIC_INDIC, (digit) => String(digit.charCodeAt(0) & 0xf))
    .replace('٫', '.');
  if (!/^-?\d{1,7}(\.\d{1,6})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) &&
    value > -MEASUREMENT_VALUE_LIMIT &&
    value < MEASUREMENT_VALUE_LIMIT
    ? value
    : null;
}

export function parseCorrectionInput(input: unknown): CorrectionInput | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const { workspaceId, clientId, measurementId, value, expectedUpdatedAt } =
    raw;
  if (
    typeof workspaceId !== 'string' ||
    typeof clientId !== 'string' ||
    typeof measurementId !== 'string' ||
    !isUuid(workspaceId) ||
    !isUuid(clientId) ||
    !isUuid(measurementId) ||
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= -MEASUREMENT_VALUE_LIMIT ||
    value >= MEASUREMENT_VALUE_LIMIT ||
    typeof expectedUpdatedAt !== 'string' ||
    expectedUpdatedAt.length > 64 ||
    Number.isNaN(Date.parse(expectedUpdatedAt))
  )
    return null;
  return { workspaceId, clientId, measurementId, value, expectedUpdatedAt };
}

/** Statuses returned by every measurement write (staff correction, client add/edit). */
export type MeasurementWriteStatus =
  | 'corrected'
  | 'updated'
  | 'recorded'
  | 'unchanged'
  | 'conflict'
  | 'duplicate_same_day'
  | 'not_editable'
  | 'invalid'
  | 'denied'
  | 'not_found'
  | 'unavailable';

export type MeasurementWriteResult = { status: MeasurementWriteStatus };

const MEASUREMENT_TYPE = /^[A-Za-z0-9_.-]{1,64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === 'object' && !Array.isArray(input);
}

function isValue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > -MEASUREMENT_VALUE_LIMIT &&
    value < MEASUREMENT_VALUE_LIMIT
  );
}

function isVersion(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    !Number.isNaN(Date.parse(value))
  );
}

/** Client manual entry (FR-012/FR-015), parsed from untrusted action input. */
export type OwnEntryInput = {
  workspaceId: string;
  clientId: string;
  measurementType: string;
  value: number;
  recordedOn: string;
};

export function parseOwnEntryInput(input: unknown): OwnEntryInput | null {
  if (!isRecord(input)) return null;
  const { workspaceId, clientId, measurementType, value, recordedOn } = input;
  if (
    !isUuid(workspaceId) ||
    !isUuid(clientId) ||
    typeof measurementType !== 'string' ||
    !MEASUREMENT_TYPE.test(measurementType) ||
    !isValue(value) ||
    typeof recordedOn !== 'string' ||
    !ISO_DATE.test(recordedOn) ||
    Number.isNaN(Date.parse(`${recordedOn}T00:00:00Z`))
  )
    return null;
  return { workspaceId, clientId, measurementType, value, recordedOn };
}

/** Client edit of an own manual measurement (PO 2026-11-14 "Add + edit own"). */
export type OwnEditInput = {
  workspaceId: string;
  measurementId: string;
  value: number;
  expectedUpdatedAt: string;
};

export function parseOwnEditInput(input: unknown): OwnEditInput | null {
  if (!isRecord(input)) return null;
  const { workspaceId, measurementId, value, expectedUpdatedAt } = input;
  if (
    !isUuid(workspaceId) ||
    !isUuid(measurementId) ||
    !isValue(value) ||
    !isVersion(expectedUpdatedAt)
  )
    return null;
  return { workspaceId, measurementId, value, expectedUpdatedAt };
}

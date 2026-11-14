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

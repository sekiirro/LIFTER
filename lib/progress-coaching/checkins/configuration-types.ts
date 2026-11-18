import { isUuid } from '../../client-notes/validation';
import type { LocalizedText } from '../types';

/** A form the weekly check-in can use; `valid` = carries the FR-037 questions. */
export type CheckinFormOption = {
  formId: string;
  name: string;
  title: LocalizedText | null;
  versionNumber: number;
  valid: boolean;
};

export type CheckinConfigurationResult =
  | {
      status: 'ok';
      current: { formId: string; versionNumber: number } | null;
      forms: CheckinFormOption[];
    }
  | { status: 'denied' | 'unavailable' };

export type CheckinConfigureStatus =
  | 'configured'
  | 'invalid'
  | 'conflict'
  | 'not_found'
  | 'denied'
  | 'unavailable';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function localized(value: unknown): LocalizedText | null {
  if (!isRecord(value)) return null;
  const { en, ar } = value;
  return typeof en === 'string' && en && typeof ar === 'string' && ar
    ? { en, ar }
    : null;
}

export function parseCheckinConfiguration(
  data: unknown,
): CheckinConfigurationResult {
  if (!isRecord(data) || data.status !== 'ok' || !Array.isArray(data.forms))
    return { status: 'unavailable' };
  const forms: CheckinFormOption[] = [];
  for (const raw of data.forms) {
    if (
      !isRecord(raw) ||
      !isUuid(raw.form_id) ||
      typeof raw.name !== 'string' ||
      !Number.isInteger(raw.version_number) ||
      typeof raw.valid !== 'boolean'
    )
      return { status: 'unavailable' };
    forms.push({
      formId: raw.form_id,
      name: raw.name,
      title: localized(raw.title),
      versionNumber: raw.version_number as number,
      valid: raw.valid,
    });
  }
  let current: { formId: string; versionNumber: number } | null = null;
  if (data.current !== null && data.current !== undefined) {
    const c = data.current;
    if (
      !isRecord(c) ||
      !isUuid(c.form_id) ||
      !Number.isInteger(c.version_number)
    )
      return { status: 'unavailable' };
    current = { formId: c.form_id, versionNumber: c.version_number as number };
  }
  return { status: 'ok', current, forms };
}

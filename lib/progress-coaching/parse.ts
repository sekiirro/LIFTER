import { TIMELINE_EVENT_TYPES, type TimelineEventType } from './constants';
import type {
  LocalizedText,
  ProgressMeasurement,
  TimelineEvent,
} from './types';

type Raw = Record<string, unknown>;
const isRecord = (value: unknown): value is Raw =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : null;

function localized(value: unknown): LocalizedText | null {
  if (typeof value === 'string' && value.length > 0)
    return { en: value, ar: value };
  if (!isRecord(value)) return null;
  const en = str(value.en);
  const ar = str(value.ar);
  return en && ar ? { en, ar } : null;
}

export function parseMeasurement(raw: unknown): ProgressMeasurement | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const measurementType = str(raw.measurement_type);
  const value =
    typeof raw.value === 'number'
      ? raw.value
      : typeof raw.value === 'string'
        ? Number(raw.value)
        : NaN;
  const recordedOn = str(raw.recorded_on);
  const updatedAt = str(raw.updated_at);
  const sourceKind = raw.source_kind;
  if (
    !id ||
    !measurementType ||
    !Number.isFinite(value) ||
    !recordedOn ||
    !updatedAt ||
    (sourceKind !== 'checkin' && sourceKind !== 'manual')
  )
    return null;
  return {
    id,
    measurementType,
    value,
    unitEn: str(raw.unit_en),
    unitAr: str(raw.unit_ar),
    recordedOn,
    sourceKind,
    updatedAt,
    label: localized(raw.label),
  };
}

export function parseTimelineEvent(raw: unknown): TimelineEvent | null {
  if (!isRecord(raw)) return null;
  const eventType = raw.event_type;
  const occurredAt = str(raw.occurred_at);
  const referenceId = str(raw.reference_id);
  if (
    typeof eventType !== 'string' ||
    !(TIMELINE_EVENT_TYPES as readonly string[]).includes(eventType) ||
    !occurredAt ||
    !referenceId
  )
    return null;
  const planKind =
    raw.plan_kind === 'workout' || raw.plan_kind === 'nutrition'
      ? raw.plan_kind
      : null;
  return {
    eventType: eventType as TimelineEventType,
    occurredAt,
    referenceId,
    planKind,
  };
}

/** Deterministic chronological order with a stable tie-break (FR-029). */
export function sortTimeline(
  events: readonly TimelineEvent[],
): TimelineEvent[] {
  const rank = (type: TimelineEventType) => TIMELINE_EVENT_TYPES.indexOf(type);
  return [...events].sort(
    (a, b) =>
      Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
      rank(a.eventType) - rank(b.eventType) ||
      a.referenceId.localeCompare(b.referenceId),
  );
}

export function parseList<T>(
  value: unknown,
  parse: (raw: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value)) return null;
  const out: T[] = [];
  for (const raw of value) {
    const parsed = parse(raw);
    if (!parsed) return null;
    out.push(parsed);
  }
  return out;
}

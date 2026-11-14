import type { TimelineEventType } from './constants';

export type LocalizedText = { en: string; ar: string };

export type ProgressMeasurement = {
  id: string;
  measurementType: string;
  value: number;
  unitEn: string | null;
  unitAr: string | null;
  recordedOn: string;
  sourceKind: 'checkin' | 'manual';
  updatedAt: string;
  /** Trainer-authored F15 question label, displayed as authored. */
  label: LocalizedText | null;
};

export type TimelineEvent = {
  eventType: TimelineEventType;
  occurredAt: string;
  referenceId: string;
  planKind: 'workout' | 'nutrition' | null;
};

export type ProgressStatus = 'denied' | 'not_found' | 'unavailable';

/** A measurement type the client may enter: a current check-in question (FR-014). */
export type MeasurementEntryType = {
  id: string;
  label: LocalizedText | null;
  unitEn: string | null;
  unitAr: string | null;
  min: number | null;
  max: number | null;
  step: number | null;
};

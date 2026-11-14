import { describe, expect, it } from 'vitest';
import {
  TIMELINE_EVENT_TYPES,
  TIMELINE_EVENT_TYPES_WITH_SOURCE,
} from '../../lib/progress-coaching/constants';
import {
  parseList,
  parseMeasurement,
  parseTimelineEvent,
  sortTimeline,
} from '../../lib/progress-coaching/parse';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

describe('client timeline (FR-029, FR-032, SC-009)', () => {
  it('is exactly the fixed meaningful event set, each with approved copy', () => {
    expect(TIMELINE_EVENT_TYPES).toEqual([
      'registration',
      'renewal',
      'firstDelivery',
      'trainerChange',
      'replacementOpen',
      'replacementApproved',
      'replacementRejected',
      'replacementStale',
      'freezeApply',
      'freezeRemove',
      'closure',
    ]);
    for (const type of TIMELINE_EVENT_TYPES) {
      expect(en[`timeline.event.${type}`]).toBeTruthy();
      expect(ar[`timeline.event.${type}`]).toBeTruthy();
    }
    expect(TIMELINE_EVENT_TYPES_WITH_SOURCE).not.toContain('trainerChange');
  });

  it('rejects micro-audit or unknown event types', () => {
    expect(
      parseTimelineEvent({
        event_type: 'form.draft_saved',
        occurred_at: '2026-11-01T10:00:00Z',
        reference_id: 'r1',
      }),
    ).toBeNull();
    expect(
      parseList(
        [
          {
            event_type: 'registration',
            occurred_at: '2026-11-01T10:00:00Z',
            reference_id: 'r1',
          },
          { event_type: 'note.created', occurred_at: 'x', reference_id: 'r2' },
        ],
        parseTimelineEvent,
      ),
    ).toBeNull();
  });

  it('orders chronologically with a deterministic tie-break', () => {
    const at = '2026-11-01T10:00:00Z';
    const sorted = sortTimeline([
      {
        eventType: 'freezeApply',
        occurredAt: at,
        referenceId: 'b',
        planKind: null,
      },
      {
        eventType: 'registration',
        occurredAt: at,
        referenceId: 'z',
        planKind: null,
      },
      {
        eventType: 'renewal',
        occurredAt: '2026-10-01T10:00:00Z',
        referenceId: 'a',
        planKind: null,
      },
      {
        eventType: 'freezeApply',
        occurredAt: at,
        referenceId: 'a',
        planKind: null,
      },
    ]);
    expect(sorted.map((e) => `${e.eventType}:${e.referenceId}`)).toEqual([
      'renewal:a',
      'registration:z',
      'freezeApply:a',
      'freezeApply:b',
    ]);
  });
});

describe('measurement rows', () => {
  it('parses database rows and keeps the authored label', () => {
    expect(
      parseMeasurement({
        id: 'm1',
        measurement_type: 'bodyWeight',
        value: '92.5',
        unit_en: 'kg',
        unit_ar: 'كجم',
        recorded_on: '2026-11-09',
        source_kind: 'checkin',
        updated_at: '2026-11-09T08:00:00.123456+00:00',
        label: { en: 'Body weight', ar: 'الوزن' },
      }),
    ).toMatchObject({ value: 92.5, label: { en: 'Body weight' } });
    expect(
      parseMeasurement({
        id: 'm1',
        measurement_type: 'bodyWeight',
        value: 'NaN',
        recorded_on: '2026-11-09',
        source_kind: 'checkin',
        updated_at: 'x',
      }),
    ).toBeNull();
  });
});

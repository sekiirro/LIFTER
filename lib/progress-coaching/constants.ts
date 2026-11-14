/** Spec 023 shared constants. */

/** FR-001: a check-in is due every 7 non-frozen days after activation. */
export const CHECKIN_INTERVAL_ACTIVE_DAYS = 7;

/** FR-007: reminders go out at 10:00 workspace time. */
export const CHECKIN_REMINDER_HOUR = 10;

/**
 * No per-workspace timezone setting exists; every LIFTER time rule runs in
 * Africa/Cairo (constitution IX). Recorded as an open question in the PR.
 */
export const WORKSPACE_TIME_ZONE = 'Africa/Cairo';

/** F15 occurrence-key prefix of weekly check-in assignments. */
export const CHECKIN_OCCURRENCE_PREFIX = 'weekly_checkin:';

/** FR-037: question ids of the two self-report adherence answers. */
export const ADHERENCE_QUESTION_IDS = {
  workout: 'workoutAdherence',
  diet: 'dietAdherence',
} as const;

/** FR-029 fixed meaningful timeline event set. */
export const TIMELINE_EVENT_TYPES = [
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
] as const;
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

/** Event types with an implemented database source today. */
export const TIMELINE_EVENT_TYPES_WITH_SOURCE: readonly TimelineEventType[] = [
  'registration',
  'renewal',
  'firstDelivery',
  'freezeApply',
  'freezeRemove',
  'closure',
];

/**
 * F22 US3 client notices (FR-009; PO 2026-11-14 PO-4). Closed parsing of
 * `read_client_notices` / `mark_client_notice_read`. Rows are IDs-only; the
 * text is the approved catalog copy chosen by kind, never stored content.
 */
import type { MessageKey } from '../i18n';
import { isUuid } from './portal-projection';

export const CLIENT_NOTICE_KINDS = [
  'workout_delivered',
  'nutrition_delivered',
  'subscription_activated',
  'workout_delivered_activated',
  'nutrition_delivered_activated',
  'checkin_reminder_day_of',
  'checkin_reminder_followup',
  'food_replacement_resolved',
  'subscription_expiring_t3',
  'subscription_expiring_t3_short_lead',
  'subscription_expiring_t1',
  'subscription_expired',
] as const;
export type ClientNoticeKind = (typeof CLIENT_NOTICE_KINDS)[number];

/**
 * Approved copy per kind. F22 kinds use copy-proposal.md (S55-PO-10); the F23
 * kinds use the S55-PO-10 approved F23 strings (check-in reminder body, food
 * replacement notification) from specs/023 copy-proposal.md.
 */
export const NOTICE_MESSAGE: Record<ClientNoticeKind, MessageKey | null> = {
  workout_delivered: 'client.portal.notice.workoutDelivered',
  nutrition_delivered: 'client.portal.notice.nutritionDelivered',
  subscription_activated: 'client.portal.notice.subscriptionActivated',
  workout_delivered_activated: 'client.portal.notice.workoutAndActivated',
  nutrition_delivered_activated: 'client.portal.notice.nutritionAndActivated',
  checkin_reminder_day_of: 'checkin.reminder.dayOf.body',
  checkin_reminder_followup: 'checkin.reminder.followup.body',
  food_replacement_resolved: 'foodReplacement.notification.resolved',
  subscription_expiring_t3: 'client.portal.inbox.notice.expiryT3.title',
  subscription_expiring_t3_short_lead:
    'client.portal.inbox.notice.expiryT3.title',
  subscription_expiring_t1: 'client.portal.inbox.notice.expiryT1.title',
  subscription_expired: 'client.portal.inbox.notice.expired.title',
};

export const NOTICE_BODY_MESSAGE: Partial<
  Record<ClientNoticeKind, MessageKey>
> = {
  subscription_expiring_t3: 'client.portal.inbox.notice.expiryT3.body',
  subscription_expiring_t3_short_lead:
    'client.portal.inbox.notice.expiryT3.body',
  subscription_expiring_t1: 'client.portal.inbox.notice.expiryT1.body',
  subscription_expired: 'client.portal.inbox.notice.expired.body',
};

export type ClientNotice = {
  noticeId: string;
  kind: ClientNoticeKind;
  createdAt: string;
  readAt: string | null;
  expiryDate: string | null;
  dismissedAt: string | null;
};

export type ClientNotices =
  { status: 'ok'; notices: ClientNotice[] } | { status: 'denied' };

export function shouldShowClientNotices(overviewStatus: string): boolean {
  return overviewStatus === 'ok' || overviewStatus === 'restricted';
}

export type MarkNoticeResult = { status: 'read' | 'not_found' | 'denied' };
export type DismissNoticeResult = {
  status: 'dismissed' | 'not_found' | 'denied';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function isExpiryKind(kind: ClientNoticeKind): boolean {
  return (
    kind.startsWith('subscription_expiring_') || kind === 'subscription_expired'
  );
}

function parseNotice(value: unknown): ClientNotice | null {
  if (!isRecord(value)) return null;
  const {
    notice_id,
    notice_kind,
    created_at,
    read_at,
    expiry_date,
    dismissed_at,
  } = value;
  const knownKind = (CLIENT_NOTICE_KINDS as readonly unknown[]).includes(
    notice_kind,
  );
  if (
    !isUuid(notice_id) ||
    !knownKind ||
    !isTimestamp(created_at) ||
    (read_at !== null && !isTimestamp(read_at)) ||
    (dismissed_at !== null && !isTimestamp(dismissed_at)) ||
    (isExpiryKind(notice_kind as ClientNoticeKind)
      ? !isCalendarDate(expiry_date)
      : expiry_date !== null)
  )
    return null;
  return {
    noticeId: notice_id,
    kind: notice_kind as ClientNoticeKind,
    createdAt: created_at,
    readAt: read_at,
    expiryDate: expiry_date as string | null,
    dismissedAt: dismissed_at as string | null,
  };
}

/** Any unexpected shape or row fails closed to `denied`. */
export function projectClientNotices(raw: unknown): ClientNotices {
  if (!isRecord(raw) || raw.status !== 'ok' || !Array.isArray(raw.notices))
    return { status: 'denied' };
  const notices: ClientNotice[] = [];
  const seen = new Set<string>();
  for (const item of raw.notices) {
    const notice = parseNotice(item);
    if (!notice || seen.has(notice.noticeId)) return { status: 'denied' };
    seen.add(notice.noticeId);
    notices.push(notice);
  }
  return { status: 'ok', notices };
}

/** Notices the F22 surface can render with approved copy. */
export function renderableNotices(
  notices: ClientNotice[],
): Array<ClientNotice & { message: MessageKey; bodyMessage?: MessageKey }> {
  return notices.flatMap((notice) => {
    const message = NOTICE_MESSAGE[notice.kind];
    const bodyMessage = NOTICE_BODY_MESSAGE[notice.kind];
    return message
      ? [{ ...notice, message, ...(bodyMessage ? { bodyMessage } : {}) }]
      : [];
  });
}

export function projectMarkNoticeResult(raw: unknown): MarkNoticeResult {
  if (isRecord(raw) && (raw.status === 'read' || raw.status === 'not_found'))
    return { status: raw.status };
  return { status: 'denied' };
}

export function projectDismissNoticeResult(raw: unknown): DismissNoticeResult {
  if (isRecord(raw) && raw.status === 'dismissed')
    return { status: 'dismissed' };
  if (isRecord(raw) && raw.status === 'not_found')
    return { status: 'not_found' };
  return { status: 'denied' };
}

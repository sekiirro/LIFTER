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
] as const;
export type ClientNoticeKind = (typeof CLIENT_NOTICE_KINDS)[number];

/**
 * Approved F22 copy per kind (copy-proposal.md, S55-PO-10). F23 check-in
 * reminder kinds have no catalog key on main yet, so the F22 surface does
 * not render them; F23 adds their mapping with its approved keys.
 */
export const NOTICE_MESSAGE: Record<ClientNoticeKind, MessageKey | null> = {
  workout_delivered: 'client.portal.notice.workoutDelivered',
  nutrition_delivered: 'client.portal.notice.nutritionDelivered',
  subscription_activated: 'client.portal.notice.subscriptionActivated',
  workout_delivered_activated: 'client.portal.notice.workoutAndActivated',
  nutrition_delivered_activated: 'client.portal.notice.nutritionAndActivated',
  checkin_reminder_day_of: null,
  checkin_reminder_followup: null,
};

export type ClientNotice = {
  noticeId: string;
  kind: ClientNoticeKind;
  createdAt: string;
  readAt: string | null;
};

export type ClientNotices =
  { status: 'ok'; notices: ClientNotice[] } | { status: 'denied' };

export type MarkNoticeResult = { status: 'read' | 'not_found' | 'denied' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function parseNotice(value: unknown): ClientNotice | null {
  if (!isRecord(value)) return null;
  const { notice_id, notice_kind, created_at, read_at } = value;
  if (
    !isUuid(notice_id) ||
    !(CLIENT_NOTICE_KINDS as readonly unknown[]).includes(notice_kind) ||
    !isTimestamp(created_at) ||
    (read_at !== null && !isTimestamp(read_at))
  )
    return null;
  return {
    noticeId: notice_id,
    kind: notice_kind as ClientNoticeKind,
    createdAt: created_at,
    readAt: read_at,
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
): Array<ClientNotice & { message: MessageKey }> {
  return notices.flatMap((notice) => {
    const message = NOTICE_MESSAGE[notice.kind];
    return message ? [{ ...notice, message }] : [];
  });
}

export function projectMarkNoticeResult(raw: unknown): MarkNoticeResult {
  if (isRecord(raw) && (raw.status === 'read' || raw.status === 'not_found'))
    return { status: raw.status };
  return { status: 'denied' };
}

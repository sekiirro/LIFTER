import type { MessageKey } from '../../i18n';

/** Approved copy per staff notice kind (S55-PO-10, specs/023 copy-proposal.md). */
export const STAFF_NOTICE_MESSAGE = {
  food_replacement_open: 'foodReplacement.notification.open',
  monthly_quality_reminder: 'workforce.reminder.body',
} as const satisfies Record<string, MessageKey>;

export type StaffNoticeKind = keyof typeof STAFF_NOTICE_MESSAGE;

export type StaffNotice = {
  noticeId: string;
  workspaceId: string;
  kind: StaffNoticeKind;
  /** The food replacement request the notice is about. */
  requestId: string;
  createdAt: string;
  readAt: string | null;
};

export type StaffNoticesResult =
  | { status: 'ok'; notices: StaffNotice[] }
  | { status: 'denied' | 'unavailable' };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

function parseNotice(value: unknown): StaffNotice | null {
  if (!isRecord(value)) return null;
  const { notice_id, workspace_id, notice_kind, source_key, created_at } =
    value;
  const read_at = value.read_at;
  if (
    typeof notice_id !== 'string' ||
    !UUID.test(notice_id) ||
    typeof workspace_id !== 'string' ||
    !UUID.test(workspace_id) ||
    typeof notice_kind !== 'string' ||
    !(notice_kind in STAFF_NOTICE_MESSAGE) ||
    typeof source_key !== 'string' ||
    !UUID.test(source_key) ||
    !isTimestamp(created_at) ||
    (read_at !== null && !isTimestamp(read_at))
  )
    return null;
  return {
    noticeId: notice_id,
    workspaceId: workspace_id,
    kind: notice_kind as StaffNoticeKind,
    requestId: source_key,
    createdAt: created_at,
    readAt: read_at,
  };
}

/** Any unexpected shape, kind or duplicate row fails closed to `denied`. */
export function parseStaffNotices(raw: unknown): StaffNoticesResult {
  if (!isRecord(raw) || raw.status !== 'ok' || !Array.isArray(raw.notices))
    return { status: 'denied' };
  const notices: StaffNotice[] = [];
  const seen = new Set<string>();
  for (const item of raw.notices) {
    const notice = parseNotice(item);
    if (!notice || seen.has(notice.noticeId)) return { status: 'denied' };
    seen.add(notice.noticeId);
    notices.push(notice);
  }
  return { status: 'ok', notices };
}

export function markStaffNoticeResult(
  raw: unknown,
): 'read' | 'not_found' | 'denied' {
  if (isRecord(raw) && (raw.status === 'read' || raw.status === 'not_found'))
    return raw.status;
  return 'denied';
}

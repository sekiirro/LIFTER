import {
  dismissClientNoticeFormAction,
  markClientNoticeReadFormAction,
} from '../../app/(client)/plans/actions';
import { renderableNotices } from '../../lib/client-access/notices-projection';
import type { ClientNotices as ClientNoticesResult } from '../../lib/client-access/notices-projection';
import type { Locale } from '../../lib/design/preferences';
import type { Messages } from '../../lib/i18n';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { formatCalendarDate, formatPublishedAt } from './format';
import styles from './client-portal.module.css';

/**
 * F22 US3 client notices (F15 inbox client-recipient extension). Approved copy
 * only: notice text by kind, "Mark as read", "Dismiss notification" and the empty state. A failed read
 * renders nothing rather than a misleading empty state.
 */
export function ClientNotices({
  result,
  locale,
  messages: m,
}: {
  result: ClientNoticesResult;
  locale: Locale;
  messages: Messages;
}) {
  if (result.status !== 'ok') return null;
  const notices = renderableNotices(result.notices);
  if (notices.length === 0)
    return (
      <p className={styles.meta} data-testid="client-notices-empty">
        {m['client.portal.inbox.empty']}
      </p>
    );
  return (
    <ul className={styles.notices} data-testid="client-notices">
      {notices.map((notice) => (
        <li
          key={notice.noticeId}
          className={styles.notice}
          data-read={notice.readAt ? 'true' : 'false'}
        >
          <p>{m[notice.message]}</p>
          {notice.bodyMessage && notice.expiryDate && (
            <p>
              {m[notice.bodyMessage].replace(
                '{expiryDate}',
                formatCalendarDate(notice.expiryDate, locale),
              )}
            </p>
          )}
          <p className={styles.meta}>
            <time dateTime={notice.createdAt}>
              <Bidi>{formatPublishedAt(notice.createdAt, locale)}</Bidi>
            </time>
          </p>
          {!notice.dismissedAt && (
            <>
              {!notice.readAt && (
                <form action={markClientNoticeReadFormAction}>
                  <input
                    type="hidden"
                    name="noticeId"
                    value={notice.noticeId}
                  />
                  <Button type="submit" variant="secondary">
                    {m['client.portal.inbox.markRead']}
                  </Button>
                </form>
              )}
              <form action={dismissClientNoticeFormAction}>
                <input type="hidden" name="noticeId" value={notice.noticeId} />
                <Button type="submit" variant="secondary">
                  {m['toast.dismiss']}
                </Button>
              </form>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

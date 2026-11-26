import { cookies } from 'next/headers';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import { Skeleton } from '../../../../components/ui/States';
import buttonStyles from '../../../../components/ui/Button.module.css';
import styles from '../../../../components/workforce/TrainerCheckins.module.css';

export default async function Loading() {
  const store = await cookies();
  const m = getMessages(parseLocale(store.get(LOCALE_COOKIE)?.value));
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{m['workforce.checkin.title']}</h1>
      </div>
      <div role="status" aria-busy="true" data-testid="checkins-loading">
        <span className={buttonStyles.srOnly}>
          {m['workforce.checkin.loading']}
        </span>
        <Skeleton shape="card" />
      </div>
    </main>
  );
}

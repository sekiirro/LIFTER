import { cookies } from 'next/headers';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import { Skeleton } from '../../../../components/ui/States';
import styles from '../../../../components/workforce/MonthlyQuality.module.css';

export default async function MonthlyQualityLoading() {
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);
  return (
    <main
      className={styles.page}
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      aria-busy="true"
      aria-label={messages['workforce.quality.title']}
    >
      <header className={styles.header}>
        <h1 className={styles.title}>{messages['workforce.quality.title']}</h1>
      </header>
      <Skeleton lines={6} shape="card" />
    </main>
  );
}

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { getMessages } from '../../../../lib/i18n';
import { UploadHardeningShowcase } from './UploadHardeningShowcase';
import styles from './page.module.css';

export default async function UploadHardeningPage() {
  if (!isShowcaseEnabled(process.env)) notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);

  return (
    <main className={styles.page}>
      <p className={styles.notice} role="note">
        {messages['branding.showcaseNotice']}
      </p>
      <UploadHardeningShowcase locale={locale} />
    </main>
  );
}

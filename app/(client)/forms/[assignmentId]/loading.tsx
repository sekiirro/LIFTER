import { cookies } from 'next/headers';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import styles from '../../../../components/forms/QuestionFlow.module.css';

export default async function ClientFormLoading() {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);
  return (
    <main
      className={styles.main}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      aria-busy="true"
    >
      <p role="status">{messages['forms.loading']}</p>
    </main>
  );
}

import { getMessages } from '../../lib/i18n';
import type { Locale } from '../../lib/design/preferences';
import { Alert } from '../ui/Alert';
import styles from './QuestionFlow.module.css';

export function ClientFormUnavailable({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  return (
    <main className={styles.main} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <h1>{messages['forms.title']}</h1>
      <Alert tone="error" title={messages['forms.invalidForm']} />
    </main>
  );
}

import { cookies } from 'next/headers';
import { AuthPreferences } from '../../../components/auth/AuthPreferences';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { RecoveryForm } from './RecoveryForm';
import styles from './recovery.module.css';

export default async function RecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string | string[] }>;
}) {
  const store = await cookies();
  const m = getMessages(parseLocale(store.get(LOCALE_COOKIE)?.value));
  const params = await searchParams;
  const hash = typeof params.token_hash === 'string' ? params.token_hash : null;
  return (
    <main className={styles.main}>
      <h1>{m['auth.setPassword']}</h1>
      <RecoveryForm tokenHash={hash} messages={m} />
      <AuthPreferences />
    </main>
  );
}

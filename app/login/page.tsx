import { cookies } from 'next/headers';
import { AuthPreferences } from '../../components/auth/AuthPreferences';
import { LOCALE_COOKIE, parseLocale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { safeReturnTo } from '../../lib/auth/redirect';
import { LoginForm } from './LoginForm';
import styles from './login.module.css';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const store = await cookies();
  const m = getMessages(parseLocale(store.get(LOCALE_COOKIE)?.value));
  const params = await searchParams;
  return (
    <main className={styles.main}>
      <h1>{m['auth.signInTitle']}</h1>
      <LoginForm next={safeReturnTo(params.next)} messages={m} />
      <AuthPreferences />
    </main>
  );
}

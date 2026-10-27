import { cookies } from 'next/headers';
import { openRegistrationLink } from '../../../lib/registration-links/open';
import { getMessages } from '../../../lib/i18n';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { AuthPreferences } from '../../../components/auth/AuthPreferences';
import styles from '../../../components/registration-links/registration-links.module.css';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const m = getMessages(
    parseLocale((await cookies()).get(LOCALE_COOKIE)?.value),
  );
  const result = await openRegistrationLink((await params).token);
  return (
    <main className={styles.main}>
      <AuthPreferences />
      <h1>
        {
          m[
            result.status === 'valid'
              ? 'registration.publicValid'
              : 'registration.publicInvalid'
          ]
        }
      </h1>
      {result.status === 'valid' && <p>{result.workspace_name}</p>}
    </main>
  );
}

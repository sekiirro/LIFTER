import { cookies } from 'next/headers';
import { openRegistrationLink } from '../../../lib/registration-links/open';
import { getMessages } from '../../../lib/i18n';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { AuthPreferences } from '../../../components/auth/AuthPreferences';
import styles from '../../../components/registration-links/registration-links.module.css';
import { createPublicSessionClient } from '../../../lib/supabase/public-session';
import { phoneCountryOptions } from '../../../lib/client-accounts/phone';
import { submitClientSignup } from './actions';
import { SignupForm } from './SignupForm';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const cookieStore = await cookies();
  const locale = parseLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);
  const token = (await params).token;
  const result = await openRegistrationLink(token);
  const sessionClient = await createPublicSessionClient();
  let signedIn = false;
  if (sessionClient) {
    try {
      const { data, error } = await sessionClient.auth.getUser();
      signedIn = !error && !!data.user;
    } catch {
      signedIn = false;
    }
  }
  const signupAction = submitClientSignup.bind(null, token);
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
      {result.status === 'valid' && signedIn && (
        <p role="status">
          {locale === 'en'
            ? 'Please sign out before submitting this registration request. Return to this page after signing out.'
            : 'يرجى تسجيل الخروج قبل إرسال طلب التسجيل هذا. عُد إلى هذه الصفحة بعد تسجيل الخروج.'}
        </p>
      )}
      {result.status === 'valid' && !signedIn && (
        <SignupForm
          action={signupAction}
          locale={locale}
          phoneCountries={phoneCountryOptions(locale)}
        />
      )}
    </main>
  );
}

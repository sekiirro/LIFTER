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
import { BrandScope } from '../../../components/ui/BrandScope';
import { Card } from '../../../components/ui/Card';
import { RegistrationBrand } from '../../../components/branding/RegistrationBrand';
import { DEFAULT_BRAND } from '../../../lib/design/color';
import signupStyles from './signup.module.css';
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
  if (result.status === 'valid') {
    return (
      <main className={styles.main}>
        <AuthPreferences />
        <BrandScope color={result.branding?.color ?? DEFAULT_BRAND}>
          <Card
            as="article"
            className={signupStyles.registrationCard}
            data-registration-card="premium-centered"
          >
            <RegistrationBrand
              brand={result.branding}
              locale={locale}
              token={token}
              renderHandle={result.render_handle}
              fallbackName={result.workspace_name}
            />
            <h1>{m['registration.publicValid']}</h1>
            {signedIn && <p role="status">{m['clientSignup.signedIn']}</p>}
            {!signedIn && (
              <SignupForm
                action={signupAction}
                locale={locale}
                phoneCountries={phoneCountryOptions(locale)}
              />
            )}
          </Card>
        </BrandScope>
      </main>
    );
  }
  return (
    <main className={styles.main}>
      <AuthPreferences />
      <h1>{m['registration.publicInvalid']}</h1>
    </main>
  );
}

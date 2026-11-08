import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { AuthPreferences } from '../../../../components/auth/AuthPreferences';
import { RegistrationHero } from '../../../../components/branding/RegistrationHero';
import heroStyles from '../../../../components/branding/registration-hero.module.css';
import { BrandScope } from '../../../../components/ui/BrandScope';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { phoneCountryOptions } from '../../../../lib/client-accounts/phone';
import { getMessages } from '../../../../lib/i18n';
import { HeroPreviewSignup } from './HeroPreviewSignup';

export const dynamic = 'force-dynamic';

/**
 * Database-free registration hero preview. The public page needs a
 * registration token and a published banner; this route keeps the same hero,
 * preferences, form controls, and artwork sampling so the Glisse material can
 * be exercised in Playwright and reviewed in the showcase.
 */
export default async function HeroShowcasePage() {
  if (!isShowcaseEnabled(process.env)) notFound();

  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);

  return (
    <BrandScope color="#2563EB" className={heroStyles.brandScope}>
      <RegistrationHero
        banner={{
          src: '/dev/f14-hero/desktop.webp',
          alt: m['f14Banner.alt'],
        }}
        locale={locale}
        preferences={<AuthPreferences />}
      >
        <div className={heroStyles.formPlate}>
          <div data-registration-identity>
            <span data-brand-name>LIFTER</span>
          </div>
          <h1>{m['registration.publicValid']}</h1>
          <HeroPreviewSignup
            locale={locale}
            phoneCountries={phoneCountryOptions(locale)}
          />
        </div>
      </RegistrationHero>
    </BrandScope>
  );
}

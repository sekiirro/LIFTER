import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { RegistrationBrand } from '../../../../components/branding/RegistrationBrand';
import { BrandScope } from '../../../../components/ui/BrandScope';
import { getMessages } from '../../../../lib/i18n';
import { phoneCountryOptions } from '../../../../lib/client-accounts/phone';
import type { PublicBrandingProjection } from '../../../../lib/registration-links/open';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { HeroGlassCard } from './HeroGlassCard';
import { HeroStage, type GlassEffect, type HeroFixture } from './HeroStage';
import { HeroSignupPreview } from './HeroSignupPreview';
import styles from './page.module.css';

type QueryValue = string | string[] | undefined;

function first(value: QueryValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseFixture(value: QueryValue): HeroFixture {
  const candidate = first(value);
  return candidate === 'bright' ||
    candidate === 'none' ||
    candidate === 'desktop-only' ||
    candidate === 'mobile-only'
    ? candidate
    : 'dark';
}

function parseEffect(value: QueryValue): GlassEffect {
  const candidate = first(value);
  return candidate === 'webgl' || candidate === 'blur' ? candidate : 'svg';
}

export default async function HeroPrototypePage({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: QueryValue; effect?: QueryValue }>;
}) {
  if (!isShowcaseEnabled(process.env) || process.env.NODE_ENV === 'production')
    notFound();
  const [preferences, query] = await Promise.all([cookies(), searchParams]);
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);
  const fixture = parseFixture(query.fixture);
  const effect = parseEffect(query.effect);
  const token = 'F'.repeat(43);
  const brand: PublicBrandingProjection = {
    name: { ar: 'مساحة تجريبية', en: 'Fixture workspace' },
    color: '#2563EB',
    bannerAlt: { ar: 'عمل فني تجريبي', en: 'Prototype artwork' },
    logo: false,
    banner: false,
  };

  return (
    <BrandScope
      color={brand.color}
      className={styles.brandScope}
      data-testid="hero-brand-scope"
    >
      <HeroStage fixture={fixture} effect={effect}>
        <section className={styles.glassFrame} data-testid="registration-panel">
          <HeroGlassCard effect={effect} locale={locale}>
            <RegistrationBrand
              brand={brand}
              locale={locale}
              token={token}
              renderHandle={token}
              fallbackName={brand.name[locale]}
            />
            <h1>{messages['registration.publicValid']}</h1>
            <HeroSignupPreview
              locale={locale}
              phoneCountries={phoneCountryOptions(locale)}
            />
            <p className={styles.previewNote}>
              {messages['f14Banner.previewNote']}
            </p>
          </HeroGlassCard>
        </section>
      </HeroStage>
    </BrandScope>
  );
}

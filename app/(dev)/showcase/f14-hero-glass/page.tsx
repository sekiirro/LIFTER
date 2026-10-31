import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { preload } from 'react-dom';
import { RegistrationBrand } from '../../../../components/branding/RegistrationBrand';
import { BrandScope } from '../../../../components/ui/BrandScope';
import { DEFAULT_BRAND } from '../../../../lib/design/color';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { getMessages } from '../../../../lib/i18n';
import {
  normalizePhone,
  phoneCountryOptions,
} from '../../../../lib/client-accounts/phone';
import type { PublicBrandingProjection } from '../../../../lib/registration-links/open';
import { createF14HeroArtwork } from '../../../../tests/fixtures/f14-hero-artwork';
import { HeroGlassCard } from './HeroGlassCard';
import { HeroStage, type HeroArtwork, type HeroFixture } from './HeroStage';
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

async function validatePreviewPhone(country: string, nationalNumber: string) {
  'use server';
  if (!isShowcaseEnabled(process.env) || process.env.NODE_ENV === 'production')
    notFound();
  return normalizePhone(JSON.stringify({ country, nationalNumber }));
}

export default async function HeroPrototypePage({
  searchParams,
}: {
  searchParams: Promise<{
    fixture?: QueryValue;
  }>;
}) {
  if (!isShowcaseEnabled(process.env) || process.env.NODE_ENV === 'production')
    notFound();
  const [preferences, query] = await Promise.all([cookies(), searchParams]);
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);
  const fixture = parseFixture(query.fixture);
  const tone = fixture === 'bright' ? 'bright' : 'dark';
  const generatedDesktop = '/showcase/f14-hero-glass/artwork/desktop';
  const generatedMobile = '/showcase/f14-hero-glass/artwork/mobile';
  let artwork: HeroArtwork = {};
  if (fixture === 'desktop-only') {
    artwork = {
      desktop:
        tone === 'dark'
          ? generatedDesktop
          : createF14HeroArtwork('desktop', tone),
    };
  } else if (fixture === 'mobile-only') {
    artwork = {
      mobile:
        tone === 'dark'
          ? generatedMobile
          : createF14HeroArtwork('mobile', tone),
    };
  } else if (fixture === 'dark') {
    artwork = { desktop: generatedDesktop, mobile: generatedMobile };
  } else if (fixture !== 'none') {
    artwork = {
      desktop: createF14HeroArtwork('desktop', tone),
      mobile: createF14HeroArtwork('mobile', tone),
    };
  }
  const desktopArtwork = artwork.desktop ?? artwork.mobile;
  const mobileArtwork = artwork.mobile ?? artwork.desktop;
  if (desktopArtwork)
    preload(desktopArtwork, {
      as: 'image',
      fetchPriority: 'high',
      media: '(min-width: 48rem)',
    });
  if (mobileArtwork)
    preload(mobileArtwork, {
      as: 'image',
      fetchPriority: 'high',
      media: '(max-width: 47.999rem)',
    });

  const token = 'F'.repeat(43);
  const brand: PublicBrandingProjection = {
    name: { ar: 'مساحة تجريبية', en: 'Fixture workspace' },
    color: DEFAULT_BRAND,
    bannerAlt: { ar: 'عمل فني تجريبي', en: 'Prototype artwork' },
    logo: false,
    banner: false,
  };

  return (
    <BrandScope
      color={DEFAULT_BRAND}
      className={styles.brandScope}
      data-testid="hero-brand-scope"
    >
      <HeroStage fixture={fixture} artwork={artwork}>
        <section data-testid="registration-panel">
          <HeroGlassCard locale={locale}>
            <div className={styles.formPlate} data-testid="hero-content-plate">
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
                validatePreviewPhone={validatePreviewPhone}
              />
              <p className={styles.previewNote}>
                {messages['f14Banner.previewNote']}
              </p>
            </div>
          </HeroGlassCard>
        </section>
      </HeroStage>
    </BrandScope>
  );
}

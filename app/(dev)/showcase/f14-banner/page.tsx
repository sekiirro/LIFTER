import { cookies } from 'next/headers';
import Image from 'next/image';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { BrandScope } from '../../../../components/ui/BrandScope';
import { Bidi } from '../../../../components/ui/Bidi';
import { Card } from '../../../../components/ui/Card';
import { LanguageSwitcher } from '../../../../components/preferences/LanguageSwitcher';
import { ThemeSwitcher } from '../../../../components/preferences/ThemeSwitcher';
import {
  LOCALE_COOKIE,
  parseLocale,
  parseTheme,
  THEME_COOKIE,
} from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { getMessages } from '../../../../lib/i18n';
import { PreviewForm } from './PreviewForm';
import styles from './page.module.css';

type Variant = 'a' | 'b' | 'c';

const variants: Record<Variant, { ratio: string; bounds: string }> = {
  a: { ratio: '3 / 1', bounds: '6rem–22rem' },
  b: { ratio: '16 / 9', bounds: '9rem–38rem' },
  c: { ratio: '2 / 1', bounds: '8rem–18rem' },
};

function parseVariant(value?: string | string[]): Variant {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === 'b' || candidate === 'c' ? candidate : 'a';
}

export default async function BannerPrototypePage({
  searchParams,
}: {
  searchParams: Promise<{
    variant?: string | string[];
    image?: string | string[];
    brand?: string | string[];
  }>;
}) {
  if (!isShowcaseEnabled(process.env)) notFound();

  const [preferences, query] = await Promise.all([cookies(), searchParams]);
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(preferences.get(THEME_COOKIE)?.value);
  const m = getMessages(locale);
  const variant = parseVariant(query.variant);
  const missingImage = query.image === 'missing';
  const branded = query.brand === '1';
  const candidate = variants[variant];
  const variantLabels: Record<Variant, string> = {
    a: m['f14Banner.variantA'],
    b: m['f14Banner.variantB'],
    c: m['f14Banner.variantC'],
  };
  const registration = (
    <Card as="article" className={styles.registrationCard}>
      {missingImage ? (
        <div
          className={`${styles.hero} ${styles.fallback}`}
          role="img"
          aria-label={m['f14Banner.fallbackAlt']}
          data-testid="banner-fallback"
          data-candidate={variant}
          style={{ '--banner-ratio': candidate.ratio } as CSSProperties}
        />
      ) : (
        <Image
          className={styles.hero}
          src="/dev/f14-banner-neutral.png"
          width={1600}
          height={600}
          unoptimized
          loading="eager"
          alt={m['f14Banner.alt']}
          data-alt-ar={getMessages('ar')['f14Banner.alt']}
          data-alt-en={getMessages('en')['f14Banner.alt']}
          data-testid="hero-banner"
          data-candidate={variant}
          style={{ '--banner-ratio': candidate.ratio } as CSSProperties}
        />
      )}
      <div className={styles.identity}>
        <div className={styles.logo} aria-hidden="true">
          <span />
        </div>
        <h2>{m['f14Banner.registrationTitle']}</h2>
        <p>{m['f14Banner.registrationIntro']}</p>
      </div>
      <PreviewForm
        labels={{
          name: m['clientSignup.name'],
          email: m['clientSignup.email'],
          password: m['clientSignup.password'],
          submit: m['clientSignup.submit'],
          previewNote: m['f14Banner.previewNote'],
          complete: m['f14Banner.previewComplete'],
        }}
      />
    </Card>
  );

  return (
    <main className={styles.page} data-testid="banner-prototype">
      <header className={styles.header}>
        <h1>{m['f14Banner.pageTitle']}</h1>
        <p>{m['f14Banner.pageIntro']}</p>
      </header>

      <section className={styles.controls} aria-label={m['f14Banner.controls']}>
        <fieldset className={styles.variants}>
          <legend>{m['f14Banner.variantLabel']}</legend>
          <nav aria-label={m['f14Banner.variants']}>
            {(['a', 'b', 'c'] as const).map((key) => (
              <a
                key={key}
                href={`/showcase/f14-banner?variant=${key}${missingImage ? '&image=missing' : ''}${branded ? '&brand=1' : ''}`}
                aria-current={variant === key ? 'page' : undefined}
                data-testid={`variant-${key}`}
              >
                {variantLabels[key]}
              </a>
            ))}
          </nav>
        </fieldset>
        <div className={styles.preferences}>
          <LanguageSwitcher
            value={locale}
            label={m['language.label']}
            labels={{ ar: m['language.ar'], en: m['language.en'] }}
          />
          <ThemeSwitcher
            key={theme}
            value={theme}
            label={m['theme.label']}
            labels={{
              system: m['theme.system'],
              dark: m['theme.dark'],
              light: m['theme.light'],
            }}
          />
        </div>
        <div className={styles.modeLinks}>
          <a
            href={`/showcase/f14-banner?variant=${variant}${branded ? '' : '&brand=1'}${missingImage ? '&image=missing' : ''}`}
            aria-current={branded ? 'true' : undefined}
            data-testid="brand-override"
          >
            {branded
              ? m['f14Banner.brandOverrideOn']
              : m['f14Banner.brandOverrideOff']}
          </a>
          <a
            href={`/showcase/f14-banner?variant=${variant}${branded ? '&brand=1' : ''}${missingImage ? '' : '&image=missing'}`}
            aria-current={missingImage ? 'true' : undefined}
            data-testid="missing-image-toggle"
          >
            {missingImage
              ? m['f14Banner.showImage']
              : m['f14Banner.showFallback']}
          </a>
        </div>
      </section>

      <section
        className={styles.preview}
        aria-labelledby="registration-preview-title"
        data-testid="registration-preview"
      >
        <div className={styles.previewHeading}>
          <h2 id="registration-preview-title">
            {m['f14Banner.registrationPreview']}
          </h2>
          <p>
            {m['f14Banner.measurement']}:{' '}
            <Bidi dir="ltr">
              {candidate.ratio} · {candidate.bounds}
            </Bidi>
          </p>
        </div>
        {branded ? (
          <BrandScope color="#2563EB" data-testid="workspace-brand-scope">
            {registration}
          </BrandScope>
        ) : (
          registration
        )}
      </section>
      <footer className={styles.footer}>
        {m['f14Banner.prototypeNotice']}
      </footer>
      <span className={styles.srOnly} data-testid="active-variant">
        {variant.toUpperCase()}
      </span>
    </main>
  );
}

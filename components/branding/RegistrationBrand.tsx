import Image from 'next/image';
import { BrandScope } from '../ui/BrandScope';
import { DEFAULT_BRAND } from '../../lib/design/color';
import { getMessages } from '../../lib/i18n';
import type { PublicBrandingProjection } from '../../lib/registration-links/open';
import type { Locale } from '../../lib/design/preferences';
import { registrationBrandName } from '../../lib/branding/registration-name';
import styles from './registration-brand.module.css';

export function brandingAssetUrl(
  token: string,
  renderHandle: string,
  slot: 'logo' | 'banner',
): string {
  const query = new URLSearchParams({ handle: renderHandle });
  return `/api/branding/${encodeURIComponent(token)}/${slot}?${query}`;
}

export function RegistrationBrand({
  bannerMode = 'inline',
  brand,
  locale,
  token,
  renderHandle,
  fallbackName,
}: {
  bannerMode?: 'inline' | 'stage';
  brand?: PublicBrandingProjection;
  locale: Locale;
  token: string;
  renderHandle?: string;
  fallbackName: string;
}) {
  const name = registrationBrandName(brand?.name, locale, fallbackName);
  const handle = renderHandle;
  const messages = getMessages(locale);

  return (
    <BrandScope
      color={brand?.color ?? DEFAULT_BRAND}
      className={styles.identity}
      data-registration-identity=""
      data-registration-banner-mode={bannerMode}
    >
      {bannerMode === 'inline' && brand?.banner && handle ? (
        <div className={styles.bannerFrame} data-registration-banner-frame="">
          <Image
            className={styles.bannerImage}
            src={brandingAssetUrl(token, handle, 'banner')}
            width={1600}
            height={800}
            unoptimized
            alt={
              brand.bannerAlt[locale] ||
              brand.bannerAlt[locale === 'ar' ? 'en' : 'ar']
            }
            data-registration-banner=""
            loading="eager"
            decoding="async"
          />
        </div>
      ) : bannerMode === 'inline' ? (
        <div
          className={styles.bannerFallback}
          role="img"
          aria-label={messages['f14Banner.fallbackAlt']}
          data-registration-banner-fallback=""
        />
      ) : null}
      {brand?.logo && handle && (
        <Image
          className={styles.logo}
          src={brandingAssetUrl(token, handle, 'logo')}
          width={44}
          height={44}
          unoptimized
          alt={name}
          data-registration-logo=""
          decoding="async"
        />
      )}
      <p className={styles.name} data-brand-name="">
        {name}
      </p>
    </BrandScope>
  );
}

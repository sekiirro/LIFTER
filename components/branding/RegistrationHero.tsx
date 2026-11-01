'use client';

import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Card } from '../ui/Card';
import type { Locale } from '../../lib/design/preferences';
import { modes } from '../../lib/design/tokens';
import {
  adaptiveDimmingFromLuminance,
  photoToneFromLuminance,
  selectHeroLayoutMode,
  type HeroViewport,
} from './registration-hero';
import glass from './liquid-glass.module.css';
import styles from './registration-hero.module.css';

export type RegistrationHeroBanner = {
  src: string;
  alt: string;
};

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(red: number, green: number, blue: number): number {
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function sampleAverage(
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 48;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(
    image,
    x,
    y,
    width,
    height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let light = 0;
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    red += pixels[index]!;
    green += pixels[index + 1]!;
    blue += pixels[index + 2]!;
    light += luminance(pixels[index]!, pixels[index + 1]!, pixels[index + 2]!);
    count += 1;
  }
  return {
    red: Math.round(red / count),
    green: Math.round(green / count),
    blue: Math.round(blue / count),
    luminance: light / count,
  };
}

export function RegistrationHero({
  banner,
  children,
  locale,
  preferences,
}: {
  banner?: RegistrationHeroBanner;
  children: ReactNode;
  locale: Locale;
  preferences?: ReactNode;
}) {
  const stageRef = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState<HeroViewport>('desktop');
  const hasBanner = Boolean(banner?.src);
  const layoutMode = selectHeroLayoutMode({ hasBanner, viewport });

  useEffect(() => {
    const query = window.matchMedia('(min-width: 48rem)');
    const update = () => setViewport(query.matches ? 'desktop' : 'mobile');
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const updateArtworkSamples = useCallback(() => {
    const stage = stageRef.current;
    const image = stage?.querySelector<HTMLImageElement>('[data-hero-image]');
    const card = stage?.querySelector<HTMLElement>(
      '[data-testid="registration-hero-card"]',
    );
    if (!stage || !image || !card || !image.complete || !image.naturalWidth)
      return;

    try {
      const scale = Math.max(
        image.clientWidth / image.naturalWidth,
        image.clientHeight / image.naturalHeight,
      );
      const renderedWidth = image.naturalWidth * scale;
      const renderedHeight = image.naturalHeight * scale;
      const position = getComputedStyle(image).objectPosition.split(' ');
      const ratio = (value: string | undefined, fallback: number) => {
        if (value?.endsWith('%')) return Number.parseFloat(value) / 100;
        if (value === 'left' || value === 'top') return 0;
        if (value === 'right' || value === 'bottom') return 1;
        return fallback;
      };
      const imageRect = image.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const renderedLeft =
        imageRect.left +
        (imageRect.width - renderedWidth) * ratio(position[0], 0.5);
      const renderedTop =
        imageRect.top +
        (imageRect.height - renderedHeight) * ratio(position[1], 0.5);
      const left = Math.max(cardRect.left, imageRect.left);
      const right = Math.min(cardRect.right, imageRect.right);
      const top = Math.max(cardRect.top, imageRect.top);
      const bottom = Math.min(cardRect.bottom, imageRect.bottom);
      if (right <= left || bottom <= top) return;
      const sourceX = Math.max(0, (left - renderedLeft) / scale);
      const sourceY = Math.max(0, (top - renderedTop) / scale);
      const sourceWidth = Math.min(
        image.naturalWidth - sourceX,
        (right - left) / scale,
      );
      const sourceHeight = Math.min(
        image.naturalHeight - sourceY,
        (bottom - top) / scale,
      );
      const cardPhoto = sampleAverage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
      );
      const bottomEdge = sampleAverage(
        image,
        0,
        image.naturalHeight - 3,
        image.naturalWidth,
        3,
      );
      if (!cardPhoto || !bottomEdge) return;
      const adaptiveDimming = adaptiveDimmingFromLuminance(cardPhoto.luminance);
      stage.style.setProperty(
        '--hero-photo-luminance',
        cardPhoto.luminance.toFixed(4),
      );
      stage.style.setProperty(
        '--hero-adaptive-dimming',
        adaptiveDimming.toFixed(3),
      );
      stage.style.setProperty(
        '--hero-adaptive-dimming-percent',
        `${(adaptiveDimming * 100).toFixed(1)}%`,
      );
      stage.dataset.photoTone = photoToneFromLuminance(cardPhoto.luminance);
      stage.style.setProperty(
        '--hero-bottom-average',
        `rgb(${bottomEdge.red} ${bottomEdge.green} ${bottomEdge.blue})`,
      );
      stage.style.setProperty(
        '--hero-mobile-mid',
        `color-mix(in oklab, rgb(${bottomEdge.red} ${bottomEdge.green} ${bottomEdge.blue}) 62%, var(--color-bg))`,
      );
      stage.dataset.photoStatsReady = 'true';
    } catch {
      // A failed canvas read keeps the neutral CSS fallback rather than guessing.
    }
  }, []);

  useEffect(() => {
    const image =
      stageRef.current?.querySelector<HTMLImageElement>('[data-hero-image]');
    if (image?.complete) {
      if (image.naturalWidth) image.dataset.loaded = 'true';
      updateArtworkSamples();
    } else {
      image?.addEventListener('load', updateArtworkSamples, { once: true });
    }
    window.addEventListener('resize', updateArtworkSamples);
    return () => {
      image?.removeEventListener('load', updateArtworkSamples);
      window.removeEventListener('resize', updateArtworkSamples);
    };
  }, [updateArtworkSamples, banner?.src]);

  const sourceStyle = {
    '--hero-dark-error-fg': modes.dark.error.fg,
  } as CSSProperties;

  return (
    <main
      ref={stageRef}
      className={`${styles.stage} ${hasBanner ? '' : styles.noArtwork}`}
      data-testid="registration-hero"
      data-registration-hero=""
      data-hero-layout={layoutMode}
      data-has-banner={hasBanner ? 'true' : 'false'}
      style={sourceStyle}
    >
      {preferences ? (
        <div
          className={styles.preferences}
          data-testid="registration-hero-preferences"
        >
          {preferences}
        </div>
      ) : null}
      {banner ? (
        <div className={styles.artwork}>
          <Image
            className={styles.artworkImage}
            src={banner.src}
            alt={banner.alt}
            fill
            sizes="100vw"
            priority
            unoptimized
            data-hero-image=""
            data-registration-banner=""
            decoding="async"
            onLoad={(event) => {
              event.currentTarget.dataset.loaded = 'true';
              updateArtworkSamples();
            }}
          />
        </div>
      ) : null}
      <div
        className={styles.mobileFade}
        data-testid="registration-hero-mobile-fade"
        aria-hidden="true"
      />
      <div className={styles.glassFrame}>
        <Card
          as="article"
          className={`${styles.glassCard} ${glass.liquidGlassStrong}`}
          data-testid="registration-hero-card"
          data-registration-card="premium-centered"
          data-material="liquid-glass-strong"
          data-locale={locale}
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        >
          <div className={styles.glassContent}>{children}</div>
        </Card>
      </div>
    </main>
  );
}

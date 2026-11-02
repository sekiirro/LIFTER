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
  adaptiveDimmingFromBackdropLuminances,
  enterHeroSamplingFallback,
  conservativeBackdropLuminance,
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

const SAMPLE_CANVAS_WIDTH = 96;
const SAMPLE_CANVAS_HEIGHT = 48;

type ArtworkSample = {
  averageLuminance: number;
  luminances: number[];
  red: number;
  green: number;
  blue: number;
};

/**
 * Read one artwork region into a small luminance grid.
 *
 * The grid keeps every sampled cell so the caller can pick a conservative
 * upper bound for the region instead of only its average.
 */
function sampleArtwork(
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): ArtworkSample | null {
  if (width <= 0 || height <= 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_CANVAS_WIDTH;
  canvas.height = SAMPLE_CANVAS_HEIGHT;
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
  const luminances: number[] = [];
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const pixelRed = pixels[index]!;
    const pixelGreen = pixels[index + 1]!;
    const pixelBlue = pixels[index + 2]!;
    red += pixelRed;
    green += pixelGreen;
    blue += pixelBlue;
    luminances.push(luminance(pixelRed, pixelGreen, pixelBlue));
  }
  if (!luminances.length) return null;
  const count = luminances.length;
  const total = luminances.reduce((sum, value) => sum + value, 0);
  return {
    averageLuminance: total / count,
    luminances,
    red: Math.round(red / count),
    green: Math.round(green / count),
    blue: Math.round(blue / count),
  };
}

type ViewportRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** The padding-free content box of an element: where the hero text lives. */
function contentBox(element: HTMLElement): ViewportRect {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const inset = (value: string) => Number.parseFloat(value) || 0;
  return {
    left: rect.left + inset(style.paddingLeft),
    top: rect.top + inset(style.paddingTop),
    right: rect.right - inset(style.paddingRight),
    bottom: rect.bottom - inset(style.paddingBottom),
  };
}

/** Map a viewport rectangle onto the source pixels of the artwork. */
function sourceRegion(
  image: HTMLImageElement,
  imageRect: DOMRect,
  renderedLeft: number,
  renderedTop: number,
  scale: number,
  rect: ViewportRect,
) {
  const left = Math.max(rect.left, imageRect.left);
  const right = Math.min(rect.right, imageRect.right);
  const top = Math.max(rect.top, imageRect.top);
  const bottom = Math.min(rect.bottom, imageRect.bottom);
  if (right <= left || bottom <= top) return null;
  const x = Math.max(0, (left - renderedLeft) / scale);
  const y = Math.max(0, (top - renderedTop) / scale);
  const width = Math.min(image.naturalWidth - x, (right - left) / scale);
  const height = Math.min(image.naturalHeight - y, (bottom - top) / scale);
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
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
  const [samplingFallback, setSamplingFallback] = useState(false);
  const hasBanner = Boolean(banner?.src);
  const layoutMode = selectHeroLayoutMode({ hasBanner, viewport });

  useEffect(() => {
    const query = window.matchMedia('(min-width: 48rem)');
    const update = () => setViewport(query.matches ? 'desktop' : 'mobile');
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const enterSamplingFallback = useCallback((stage: HTMLElement) => {
    enterHeroSamplingFallback(stage, setSamplingFallback);
  }, []);

  const updateArtworkSamples = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (stage.dataset.hasBanner !== 'true') return;
    const image = stage.querySelector<HTMLImageElement>('[data-hero-image]');
    const card = stage.querySelector<HTMLElement>(
      '[data-testid="registration-hero-card"]',
    );
    const textArea = stage.querySelector<HTMLElement>('[data-hero-text-area]');
    if (
      !image ||
      !card ||
      !textArea ||
      !image.complete ||
      !image.naturalWidth
    ) {
      enterSamplingFallback(stage);
      return;
    }

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
      const renderedLeft =
        imageRect.left +
        (imageRect.width - renderedWidth) * ratio(position[0], 0.5);
      const renderedTop =
        imageRect.top +
        (imageRect.height - renderedHeight) * ratio(position[1], 0.5);
      // The contrast-critical region is the card content box, where the
      // heading and the form labels are painted over the artwork.
      const textRegion = sourceRegion(
        image,
        imageRect,
        renderedLeft,
        renderedTop,
        scale,
        contentBox(textArea),
      );
      if (!textRegion) {
        enterSamplingFallback(stage);
        return;
      }
      const textPhoto = sampleArtwork(
        image,
        textRegion.x,
        textRegion.y,
        textRegion.width,
        textRegion.height,
      );
      const bottomEdge = sampleArtwork(
        image,
        0,
        image.naturalHeight - 3,
        image.naturalWidth,
        3,
      );
      if (!textPhoto || !bottomEdge) {
        enterSamplingFallback(stage);
        return;
      }
      const peakLuminance = conservativeBackdropLuminance(textPhoto.luminances);
      const adaptiveDimming = adaptiveDimmingFromBackdropLuminances(
        textPhoto.luminances,
      );
      stage.style.setProperty(
        '--hero-photo-luminance',
        peakLuminance.toString(),
      );
      stage.dataset.photoAverageLuminance =
        textPhoto.averageLuminance.toString();
      stage.style.setProperty(
        '--hero-adaptive-dimming',
        adaptiveDimming.toString(),
      );
      stage.style.setProperty(
        '--hero-adaptive-dimming-percent',
        `${adaptiveDimming * 100}%`,
      );
      stage.dataset.photoTone = photoToneFromLuminance(
        textPhoto.averageLuminance,
      );
      stage.style.setProperty(
        '--hero-bottom-average',
        `rgb(${bottomEdge.red} ${bottomEdge.green} ${bottomEdge.blue})`,
      );
      stage.style.setProperty(
        '--hero-mobile-mid',
        `color-mix(in oklab, rgb(${bottomEdge.red} ${bottomEdge.green} ${bottomEdge.blue}) 62%, var(--color-bg))`,
      );
      delete stage.dataset.photoSampling;
      stage.dataset.photoStatsReady = 'true';
      setSamplingFallback(false);
    } catch {
      // A failed canvas read falls back to the opaque token card rather than
      // guessing a treatment over artwork that was never measured.
      enterSamplingFallback(stage);
    }
  }, [enterSamplingFallback]);

  useEffect(() => {
    const stage = stageRef.current;
    const image = stage?.querySelector<HTMLImageElement>('[data-hero-image]');
    if (image?.complete) {
      if (image.naturalWidth) image.dataset.loaded = 'true';
      updateArtworkSamples();
    } else {
      // A new artwork that has not loaded yet must not keep the previous
      // sample: clear it so the card can use the opaque fallback.
      if (stage?.dataset.photoStatsReady === 'true' && stage)
        enterSamplingFallback(stage);
      image?.addEventListener('load', updateArtworkSamples, { once: true });
    }
    window.addEventListener('resize', updateArtworkSamples);
    return () => {
      image?.removeEventListener('load', updateArtworkSamples);
      window.removeEventListener('resize', updateArtworkSamples);
    };
  }, [enterSamplingFallback, updateArtworkSamples, banner?.src]);

  const sourceStyle = {
    '--hero-dark-error-fg': modes.dark.error.fg,
  } as CSSProperties;

  return (
    <main
      ref={stageRef}
      className={`${styles.stage} ${hasBanner ? '' : styles.noArtwork} ${
        samplingFallback ? styles.samplingFallback : ''
      }`}
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
          <div className={styles.glassContent} data-hero-text-area="">
            {children}
          </div>
        </Card>
      </div>
    </main>
  );
}

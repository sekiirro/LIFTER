'use client';

import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type {
  HeroArtOrientation,
  HeroArtTone,
} from '../../../../tests/fixtures/f14-hero-artwork';
import styles from './page.module.css';

export type HeroFixture =
  'dark' | 'bright' | 'none' | 'desktop-only' | 'mobile-only';
export type GlassEffect = 'webgl' | 'blur' | 'none';
export type HeroMaterial = 'A' | 'B';
export type HeroArtwork = Partial<Record<HeroArtOrientation, string>>;

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

export function HeroStage({
  children,
  fixture,
  effect,
  material,
  artwork,
}: {
  children: ReactNode;
  fixture: HeroFixture;
  effect: GlassEffect;
  material: HeroMaterial;
  artwork: HeroArtwork;
}) {
  const stageRef = useRef<HTMLElement>(null);
  const tone: HeroArtTone = fixture === 'bright' ? 'bright' : 'dark';
  const desktopUrl = artwork.desktop ?? artwork.mobile;
  const mobileUrl = artwork.mobile ?? artwork.desktop;
  const mobileOnly = fixture === 'mobile-only';
  const desktopOnly = fixture === 'desktop-only';
  const hasArtwork = fixture !== 'none' && Boolean(desktopUrl && mobileUrl);

  const updateArtworkSamples = useCallback(() => {
    const stage = stageRef.current;
    const image = stage?.querySelector<HTMLImageElement>('[data-hero-image]');
    const card = stage?.querySelector<HTMLElement>(
      '[data-testid="hero-glass-card"]',
    );
    if (!stage || !image || !card || !image.complete || !image.naturalWidth)
      return;
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
    const photoTone =
      cardPhoto.luminance > 0.58
        ? 'bright'
        : cardPhoto.luminance > 0.34
          ? 'mid'
          : 'dim';
    stage.style.setProperty(
      '--hero-photo-luminance',
      cardPhoto.luminance.toFixed(4),
    );
    stage.dataset.photoTone = photoTone;
    stage.style.setProperty(
      '--hero-bottom-average',
      `rgb(${bottomEdge.red} ${bottomEdge.green} ${bottomEdge.blue})`,
    );
    stage.style.setProperty(
      '--hero-mobile-mid',
      `color-mix(in oklab, rgb(${bottomEdge.red} ${bottomEdge.green} ${bottomEdge.blue}) 62%, var(--color-bg))`,
    );
    stage.dataset.photoStatsReady = 'true';
  }, []);

  useEffect(() => {
    const image =
      stageRef.current?.querySelector<HTMLImageElement>('[data-hero-image]');
    if (image?.complete) {
      if (image.naturalWidth) image.dataset.loaded = 'true';
      updateArtworkSamples();
    } else
      image?.addEventListener('load', updateArtworkSamples, { once: true });
    window.addEventListener('resize', updateArtworkSamples);
    return () => {
      image?.removeEventListener('load', updateArtworkSamples);
      window.removeEventListener('resize', updateArtworkSamples);
    };
  }, [updateArtworkSamples, artwork]);

  const sourceStyle = {
    '--hero-focal-x': mobileOnly ? '50%' : '32%',
    '--mobile-focal-x': desktopOnly ? '19%' : '50%',
    '--hero-effect': effect,
    '--hero-bottom-average':
      tone === 'dark' ? 'rgb(54 48 41)' : 'rgb(189 184 173)',
    '--hero-mobile-mid':
      tone === 'dark'
        ? 'color-mix(in oklab, rgb(54 48 41) 62%, var(--color-bg))'
        : 'color-mix(in oklab, rgb(189 184 173) 62%, var(--color-bg))',
  } as CSSProperties;

  return (
    <main
      ref={stageRef}
      className={`${styles.stage} ${mobileOnly ? styles.mobileOnly : ''} ${fixture === 'none' ? styles.noArtwork : ''}`}
      data-testid="hero-prototype"
      data-fixture={fixture}
      data-effect={effect}
      data-material={material.toLowerCase()}
      data-art-tone={tone}
      style={sourceStyle}
    >
      {hasArtwork && (
        <picture className={styles.artwork}>
          <source media="(max-width: 47.999rem)" srcSet={mobileUrl} />
          <img
            src={desktopUrl}
            alt=""
            data-hero-image=""
            data-focal-point={desktopOnly ? 'left-subject' : 'desktop-left'}
            decoding="async"
            fetchPriority="high"
            sizes="100vw"
            onLoad={(event) => {
              event.currentTarget.dataset.loaded = 'true';
              updateArtworkSamples();
            }}
          />
        </picture>
      )}
      <div className={styles.mobileFade} aria-hidden="true" />
      {children}
    </main>
  );
}

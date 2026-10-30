'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  createF14HeroArtwork,
  type HeroArtOrientation,
  type HeroArtTone,
} from '../../../../tests/fixtures/f14-hero-artwork';
import styles from './page.module.css';

export type HeroFixture =
  'dark' | 'bright' | 'none' | 'desktop-only' | 'mobile-only';
export type GlassEffect = 'webgl' | 'svg' | 'blur';
export type HeroMaterial = 'A' | 'B';

type ArtworkSet = Partial<Record<HeroArtOrientation, string>>;

export function HeroStage({
  children,
  fixture,
  effect,
  material,
}: {
  children: ReactNode;
  fixture: HeroFixture;
  effect: GlassEffect;
  material: HeroMaterial;
}) {
  const [artwork, setArtwork] = useState<ArtworkSet>({});
  const tone: HeroArtTone = fixture === 'bright' ? 'bright' : 'dark';

  useEffect(() => {
    let active = true;
    const urls: ArtworkSet = {};
    const orientations: HeroArtOrientation[] =
      fixture === 'desktop-only'
        ? ['desktop']
        : fixture === 'mobile-only'
          ? ['mobile']
          : fixture === 'none'
            ? []
            : ['desktop', 'mobile'];
    void Promise.all(
      orientations.map(async (orientation) => {
        urls[orientation] = await createF14HeroArtwork(orientation, tone);
      }),
    ).then(() => {
      if (active) setArtwork(urls);
      else
        Object.values(urls).forEach((url) => url && URL.revokeObjectURL(url));
    });
    return () => {
      active = false;
      Object.values(urls).forEach((url) => url && URL.revokeObjectURL(url));
    };
  }, [fixture, tone]);

  const desktopUrl = artwork.desktop ?? artwork.mobile;
  const mobileUrl = artwork.mobile ?? artwork.desktop;
  const mobileOnly = fixture === 'mobile-only';
  const desktopOnly = fixture === 'desktop-only';
  const imageLoaded = Boolean(desktopUrl && mobileUrl);
  const sourceStyle = {
    '--hero-focal-x': mobileOnly ? '50%' : '32%',
    '--mobile-focal-x': desktopOnly ? '19%' : '50%',
    '--hero-effect': effect,
  } as CSSProperties;

  return (
    <main
      className={`${styles.stage} ${mobileOnly ? styles.mobileOnly : ''} ${fixture === 'none' ? styles.noArtwork : ''}`}
      data-testid="hero-prototype"
      data-fixture={fixture}
      data-effect={effect}
      data-material={material}
      style={sourceStyle}
    >
      {imageLoaded && (
        <picture className={styles.artwork}>
          <source media="(max-width: 47.999rem)" srcSet={mobileUrl} />
          <img
            src={desktopUrl}
            alt=""
            data-hero-image=""
            data-focal-point={desktopOnly ? 'left-subject' : 'desktop-left'}
            onLoad={(event) => {
              event.currentTarget.dataset.loaded = 'true';
            }}
          />
        </picture>
      )}
      <div className={styles.mobileFade} aria-hidden="true" />
      {children}
    </main>
  );
}

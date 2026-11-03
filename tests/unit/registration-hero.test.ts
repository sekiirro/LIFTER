import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PHONE_NUMBER_GROUP_DIRECTION,
  PHONE_NUMBER_GROUP_GAP,
  applyHeroSamplingFallback,
  conservativeBackdropLuminance,
  darkestBackdropLuminance,
  enterHeroSamplingFallback,
  heroArtworkState,
  type HeroResizeEntry,
  observeHeroTextRegion,
  photoToneFromLuminance,
  selectHeroLayoutMode,
  subscribeToHeroArtwork,
} from '../../components/branding/registration-hero';

const signupFormSource = readFileSync(
  'app/register/[token]/SignupForm.tsx',
  'utf8',
);
const signupStylesSource = readFileSync(
  'app/register/[token]/signup.module.css',
  'utf8',
);
const heroStylesSource = readFileSync(
  'components/branding/registration-hero.module.css',
  'utf8',
);
const heroComponentSource = readFileSync(
  'components/branding/RegistrationHero.tsx',
  'utf8',
);
const glassSurfaceSource = readFileSync(
  'components/ui/glass/GlassSurface.tsx',
  'utf8',
);
const glassSurfaceStylesSource = readFileSync(
  'components/ui/glass/GlassSurface.module.css',
  'utf8',
);

describe('production registration hero layout', () => {
  it('selects split art layout for a desktop banner', () => {
    expect(selectHeroLayoutMode({ hasBanner: true, viewport: 'desktop' })).toBe(
      'split',
    );
  });

  it('selects stacked art layout for a mobile banner', () => {
    expect(selectHeroLayoutMode({ hasBanner: true, viewport: 'mobile' })).toBe(
      'stacked',
    );
  });

  it('centers the card when no banner is published', () => {
    expect(
      selectHeroLayoutMode({ hasBanner: false, viewport: 'desktop' }),
    ).toBe('centered');
    expect(selectHeroLayoutMode({ hasBanner: false, viewport: 'mobile' })).toBe(
      'centered',
    );
  });
});

describe('production registration hero artwork diagnostics', () => {
  it('classifies sampled image tone without coupling it to the card treatment', () => {
    expect(photoToneFromLuminance(0.05)).toBe('dim');
    expect(photoToneFromLuminance(0.5)).toBe('mid');
    expect(photoToneFromLuminance(0.9)).toBe('bright');
    expect(heroStylesSource).not.toMatch(/data-photo-tone[^}]*\.glassCard/);
    expect(heroStylesSource).not.toContain(
      '--hero-adaptive-glass-fill-percent',
    );
    expect(heroComponentSource).not.toContain('opaqueBrightCard');
  });
});

describe('production registration hero conservative backdrop sampling', () => {
  // Dark artwork with a bright local patch behind the hero text.
  const DARK_BACKDROP_LUMINANCE = 0.0129;
  const BRIGHT_PATCH_LUMINANCE = 0.9131;
  const sampledLuminances = [
    ...Array.from({ length: 75 }, () => DARK_BACKDROP_LUMINANCE),
    ...Array.from({ length: 25 }, () => BRIGHT_PATCH_LUMINANCE),
  ];
  const averageLuminance =
    sampledLuminances.reduce((sum, value) => sum + value, 0) /
    sampledLuminances.length;

  it('retains the brightest sample as an artwork diagnostic', () => {
    const conservative = conservativeBackdropLuminance(sampledLuminances);
    expect(conservative).toBeCloseTo(BRIGHT_PATCH_LUMINANCE, 6);
    expect(conservative).toBeGreaterThan(averageLuminance);
  });

  it('samples the content region without changing card theme', () => {
    expect(heroComponentSource).toContain(
      'conservativeBackdropLuminance(textPhoto.luminances)',
    );
    expect(heroComponentSource).toContain('data-hero-text-area');
    expect(heroComponentSource).not.toContain('needsOpaqueBrightCard(');
  });
});

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: (entries: HeroResizeEntry[]) => void;
  observed: unknown[] = [];
  disconnected = false;
  constructor(callback: (entries: HeroResizeEntry[]) => void) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }
  observe(target: unknown) {
    this.observed.push(target);
  }
  disconnect() {
    this.disconnected = true;
  }
}

function fakeStage(dataset: Record<string, string> = {}) {
  const properties = new Map<string, string>();
  const style = {
    setProperty: (name: string, value: string) => {
      properties.set(name, value);
    },
    removeProperty: (name: string) => {
      properties.delete(name);
    },
    getPropertyValue: (name: string) => properties.get(name) ?? '',
  } as unknown as CSSStyleDeclaration;
  return { dataset: { ...dataset } as DOMStringMap, style };
}

describe('production registration hero sampling fallback', () => {
  it('clears sampled state and artwork-derived substrate values on failure', () => {
    const stage = fakeStage({
      photoTone: 'bright',
      photoStatsReady: 'true',
      photoAverageLuminance: '0.2381',
      photoDarkestLuminance: '0.0129',
    });
    stage.style.setProperty('--hero-photo-luminance', '0.9131');
    stage.style.setProperty('--hero-bottom-average', 'rgb(26 28 36)');
    stage.style.setProperty(
      '--hero-mobile-mid',
      'color-mix(in oklab, red, blue)',
    );

    applyHeroSamplingFallback(stage);

    expect(stage.dataset.photoSampling).toBe('fallback');
    expect(stage.dataset.photoStatsReady).toBe('false');
    expect(stage.dataset.photoTone).toBeUndefined();
    expect(stage.dataset.photoAverageLuminance).toBeUndefined();
    expect(stage.dataset.photoDarkestLuminance).toBeUndefined();
    expect(stage.style.getPropertyValue('--hero-photo-luminance')).toBe('');
    expect(stage.style.getPropertyValue('--hero-bottom-average')).toBe('');
    expect(stage.style.getPropertyValue('--hero-mobile-mid')).toBe('');
  });

  it('paints the opaque token card while the sampling fallback is active', () => {
    const fallbackCard = heroStylesSource.match(
      /\.noArtwork \.glassCard\.glassCard,\s*\.samplingFallback \.glassCard\.glassCard\s*\{(?<body>[^}]*)\}/,
    );
    expect(fallbackCard?.groups?.body).toMatch(
      /background:\s*var\(--color-card\)/,
    );
    expect(fallbackCard?.groups?.body).toMatch(/color:\s*var\(--color-text\)/);
    expect(heroStylesSource).toContain('.samplingFallback .formPlate,');
  });

  it('drives the opaque fallback from the React render, not an attribute re-match', () => {
    expect(heroComponentSource).toContain('styles.samplingFallback');
    expect(heroComponentSource).toContain('setSamplingFallback(false)');
    expect(heroStylesSource).not.toContain("[data-photo-sampling='fallback']");
  });
});

describe('production registration hero fallback state', () => {
  it('clears the sample and renders the opaque fallback together', () => {
    const stage = fakeStage({
      photoTone: 'bright',
      photoStatsReady: 'true',
    });
    const fallbackStates: boolean[] = [];

    enterHeroSamplingFallback(stage, (fallback) => {
      fallbackStates.push(fallback);
    });

    expect(fallbackStates).toEqual([true]);
    expect(stage.dataset.photoSampling).toBe('fallback');
    expect(stage.dataset.photoTone).toBeUndefined();
  });

  it('routes every failure path and artwork change through the same entry point', () => {
    expect(heroComponentSource).toContain(
      'enterHeroSamplingFallback(stage, setSamplingFallback)',
    );
    // No path may clear the sampled values without the rendered fallback.
    expect(heroComponentSource).not.toContain(
      'applyHeroSamplingFallback(stage)',
    );
    expect(heroComponentSource).toMatch(
      /photoStatsReady === 'true'[\s\S]{0,160}enterSamplingFallback\(stage\)/,
    );
    const failurePaths = heroComponentSource.match(
      /enterSamplingFallback\(stage\)/g,
    );
    expect(failurePaths?.length).toBeGreaterThanOrEqual(5);
  });
});

describe('production registration hero artwork events', () => {
  it('routes a failed artwork request to the opaque fallback', () => {
    const listeners = new Map<string, () => void>();
    const image = {
      complete: false,
      naturalWidth: 0,
      addEventListener: (type: string, listener: () => void) => {
        listeners.set(type, listener);
      },
      removeEventListener: (type: string) => {
        listeners.delete(type);
      },
    };
    const stage = fakeStage({});
    const fallbackStates: boolean[] = [];

    const cleanup = subscribeToHeroArtwork(image, {
      onLoaded: () => {},
      onFailed: () =>
        enterHeroSamplingFallback(stage, (fallback) =>
          fallbackStates.push(fallback),
        ),
    });

    expect(listeners.has('load')).toBe(true);
    expect(listeners.has('error')).toBe(true);
    listeners.get('error')?.();

    expect(fallbackStates).toEqual([true]);
    expect(stage.dataset.photoSampling).toBe('fallback');
    expect(stage.dataset.photoStatsReady).toBe('false');

    cleanup();
    expect(listeners.size).toBe(0);
  });

  it('treats a complete but broken artwork as a failure', () => {
    expect(heroArtworkState({ complete: true, naturalWidth: 0 })).toBe(
      'failed',
    );
    expect(heroArtworkState({ complete: true, naturalWidth: 320 })).toBe(
      'loaded',
    );
    expect(heroArtworkState({ complete: false, naturalWidth: 0 })).toBe(
      'pending',
    );

    const stage = fakeStage({});
    const fallbackStates: boolean[] = [];
    const cleanup = subscribeToHeroArtwork(
      {
        complete: true,
        naturalWidth: 0,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      {
        onLoaded: () => {},
        onFailed: () =>
          enterHeroSamplingFallback(stage, (fallback) =>
            fallbackStates.push(fallback),
          ),
      },
    );

    expect(fallbackStates).toEqual([true]);
    expect(stage.dataset.photoSampling).toBe('fallback');
    cleanup();
  });

  it('subscribes the hero to the artwork error event', () => {
    expect(heroComponentSource).toContain('subscribeToHeroArtwork(image, {');
    expect(heroComponentSource).toMatch(
      /onFailed:[\s\S]{0,160}enterSamplingFallback\(stage\)/,
    );
    expect(heroComponentSource).not.toMatch(/addEventListener\('load'/);
    expect(heroComponentSource).not.toMatch(/removeEventListener\('load'/);
  });
});

describe('production registration hero geometry changes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resamples once per animation frame when the text region changes size', () => {
    const frames: Array<() => void> = [];
    MockResizeObserver.instances = [];

    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let resamples = 0;
    const target = {} as Element;
    const stop = observeHeroTextRegion(target, () => {
      resamples += 1;
    });
    expect(stop).not.toBeNull();
    const observer = MockResizeObserver.instances[0]!;
    expect(observer.observed).toEqual([target]);

    // ResizeObserver reports the initial size; that establishes a baseline.
    observer.callback([{ contentRect: { width: 100, height: 50 } }]);
    expect(frames.length).toBe(0);
    observer.callback([{ contentRect: { width: 120, height: 50 } }]);
    observer.callback([{ contentRect: { width: 120, height: 50 } }]);
    // The changed size is coalesced into one frame.
    expect(frames.length).toBe(1);
    expect(resamples).toBe(0);
    frames[0]!();
    expect(resamples).toBe(1);

    // An unchanged size never schedules another resample.
    observer.callback([{ contentRect: { width: 120, height: 50 } }]);
    expect(frames.length).toBe(1);
    expect(resamples).toBe(1);

    observer.callback([{ contentRect: { width: 140, height: 50 } }]);
    expect(frames.length).toBe(2);
    frames[1]!();
    expect(resamples).toBe(2);

    stop?.();
    expect(observer.disconnected).toBe(true);
  });

  it('keeps the window resize path when the browser has no ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const stop = observeHeroTextRegion({} as Element, () => {});
    expect(stop).toBeNull();
    expect(heroComponentSource).toContain(
      "window.addEventListener('resize', updateArtworkSamples)",
    );
  });

  it('observes the sampled text region and disconnects on artwork change', () => {
    expect(heroComponentSource).toContain('observeHeroTextRegion(textArea');
    expect(heroComponentSource).toContain('stopObserving?.()');
    expect(heroComponentSource).toMatch(
      /\}, \[updateArtworkSamples, banner\?\.src\]\);/,
    );
  });
});

describe('production registration hero card theme contract', () => {
  it('reads the darkest sampled pixel behind the text', () => {
    expect(darkestBackdropLuminance([0.68, 0.61, 0.0, 0.64])).toBe(0);
    expect(darkestBackdropLuminance([0.68, 0.61])).toBeCloseTo(0.61, 6);
    expect(darkestBackdropLuminance([])).toBe(1);
  });

  it('renders the card through the theme-tinted Glisse surface', () => {
    expect(heroComponentSource).toContain('<GlassSurface');
    expect(heroComponentSource).toContain('variant="strong"');
    expect(heroComponentSource).toContain('role="article"');
    expect(heroComponentSource).not.toContain("from '../ui/Card'");
    expect(heroComponentSource).not.toContain('liquid-glass.module.css');
    expect(glassSurfaceSource).toContain("'data-glass-surface': ''");
    expect(glassSurfaceStylesSource).toMatch(
      /background-color:\s*color-mix\(\s*in srgb,\s*var\(--color-card\) 82%,\s*transparent\s*\)/,
    );
    expect(glassSurfaceStylesSource).toMatch(
      /--lg-glass:\s*color-mix\(\s*in srgb,\s*var\(--color-card\) 58%,\s*transparent\s*\)/,
    );
  });

  it('keeps the form control text on the resolved theme token', () => {
    expect(heroStylesSource).toContain(
      '--hero-form-control-text: var(--color-text)',
    );
    expect(heroStylesSource).not.toContain('--hero-adaptive-dimming');
    expect(heroStylesSource).not.toContain('opaqueBrightCard');
  });

  it('leaves the hero card background and blur to the Glisse surface', () => {
    const baseCard = heroStylesSource.match(
      /\.glassCard\.glassCard\s*\{(?<body>[^}]*)\}/,
    );
    expect(baseCard).not.toBeNull();
    expect(baseCard!.groups!.body).not.toMatch(/background/);
    expect(baseCard!.groups!.body).not.toMatch(/backdrop-filter/);
    expect(baseCard!.groups!.body).toMatch(/overflow:\s*hidden/);
    expect(heroStylesSource).not.toContain('blur(4px)');
    expect(heroStylesSource).not.toContain('blur(8px)');
  });

  it('keeps the print reset for the Glisse blur', () => {
    const printCard = heroStylesSource.match(
      /@media print[\s\S]*?\.stage \.glassCard\.glassCard \{(?<body>[^}]*)\}/,
    );
    expect(printCard?.groups?.body).toMatch(
      /background:\s*var\(--color-card\)/,
    );
    expect(printCard?.groups?.body).toMatch(/backdrop-filter:\s*none/);
    expect(printCard?.groups?.body).toMatch(/-webkit-backdrop-filter:\s*none/);
  });

  it('keeps the opaque token card for every reduced-capability fallback', () => {
    expect(glassSurfaceStylesSource).toMatch(
      /@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\)[\s\S]*?background:\s*var\(--color-card\)/,
    );
    expect(glassSurfaceStylesSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?background:\s*var\(--color-card\)/,
    );
    expect(glassSurfaceStylesSource).toMatch(
      /@media \(forced-colors: active\)[\s\S]*?background:\s*Canvas/,
    );
    expect(glassSurfaceStylesSource).toMatch(
      /@media print[\s\S]*?background:\s*var\(--color-print-bg\)/,
    );
    expect(glassSurfaceStylesSource).toMatch(
      /@supports not \(\s*\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\s*\)[\s\S]*?background:\s*var\(--color-card\)/,
    );
  });
});

describe('production registration hero dense dark form', () => {
  const darkFieldRule = heroStylesSource.match(
    /:global\(:where\(\[data-theme='dark'\]\)\) \.stage \.fieldControl,\s*:global\(:where\(\[data-theme='dark'\]\)\) \.stage \.countryPicker\s*\{(?<body>[^}]*)\}/,
  );
  const osDarkFieldRule = heroStylesSource.match(
    /@media \(prefers-color-scheme: dark\)\s*\{\s*:global\(:where\(html:not\(\[data-theme='light'\]\)\)\) \.stage \.fieldControl,\s*:global\(:where\(html:not\(\[data-theme='light'\]\)\)\) \.stage \.countryPicker\s*\{(?<body>[^}]*)\}/,
  );
  const baseFieldRule = heroStylesSource.match(
    /\.stage \.fieldControl,\s*\.stage \.countryPicker\s*\{(?<body>[^}]*)\}/,
  );
  const darkTintRule = heroStylesSource.match(
    /:global\(:where\(\[data-theme='dark'\]\)\) \.stage \.formPlate\s*\{(?<body>[^}]*)\}/,
  );
  const osDarkTintRule = heroStylesSource.match(
    /@media \(prefers-color-scheme: dark\)\s*\{\s*:global\(:where\(html:not\(\[data-theme='light'\]\)\)\) \.stage \.formPlate\s*\{(?<body>[^}]*)\}/,
  );

  /** Count the class-level specificity components of a selector. */
  function classComponents(selector: string): number {
    return (selector.match(/\.[A-Za-z_][\w-]*/g) ?? []).length;
  }

  it('resolves the dark field surface to the existing card token', () => {
    expect(darkFieldRule?.groups?.body).toMatch(
      /background:\s*var\(--color-card\)/,
    );
    expect(osDarkFieldRule?.groups?.body).toMatch(
      /background:\s*var\(--color-card\)/,
    );
    // Light themes keep the existing raised-card token.
    expect(baseFieldRule?.groups?.body).toMatch(
      /background:\s*var\(--color-card-raised\)/,
    );
  });

  it('outranks the shared liquid glass edge recipe with a Hero-scoped selector', () => {
    const darkSelector =
      ":global(:where([data-theme='dark'])) .stage .fieldControl";
    const sharedEdgeSelector = '.liquidGlassEdge';
    expect(classComponents(darkSelector)).toBeGreaterThan(
      classComponents(sharedEdgeSelector),
    );
    // The shared edge recipe stays untouched, so the Hero module owns the
    // field surface in dev and production.
    expect(heroStylesSource).toContain(
      ":global(:where([data-theme='dark'])) .stage .fieldControl,",
    );
    expect(heroStylesSource).not.toMatch(
      /\.fieldControl,\s*\.countryPicker\s*\{[^}]*background:\s*var\(--color-card\)/,
    );
  });

  it('tints the dense form region with the existing card token', () => {
    for (const rule of [darkTintRule, osDarkTintRule]) {
      const body = rule?.groups?.body ?? '';
      // The PO-approved tint strength is pinned: it is the measured value that
      // keeps the exact brand ring and the filled button at 3:1 or better over
      // the worst-case bright artwork.
      expect(body).toMatch(
        /background:\s*color-mix\(\s*in srgb,\s*var\(--color-card\) 90%,\s*transparent\s*\)/,
      );
      // No hard-coded colour and no new token in the tint.
      expect(body).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(body).not.toMatch(/\brgba?\(/);
      expect(body).not.toMatch(/\bhsla?\(/);
      expect(body).not.toMatch(/--[a-z0-9-]+\s*:/);
    }
  });

  it('introduces no new custom property', () => {
    const declared = new Set(
      [...heroStylesSource.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(
        (match) => match[1],
      ),
    );
    expect(declared).toEqual(
      new Set([
        '--hero-toned-substrate',
        '--hero-bottom-average',
        '--hero-error-edge',
        '--hero-error-fg',
        '--hero-form-control-text',
      ]),
    );
  });

  it('keeps the reduced-capability fallbacks on the existing surfaces', () => {
    const reducedTransparency = heroStylesSource.match(
      /@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\)[\s\S]*?\n\}\n/,
    );
    expect(reducedTransparency?.[0]).toMatch(
      /\.stage \.fieldControl,\s*\.stage \.countryPicker\s*\{[^}]*background:\s*var\(--color-card-raised\)/,
    );
    expect(reducedTransparency?.[0]).toMatch(
      /\.stage \.formPlate\s*\{\s*background:\s*transparent;\s*\}/,
    );
    const reducedMotion = heroStylesSource.match(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\n\}\n/,
    );
    expect(reducedMotion?.[0]).toMatch(
      /\.stage \.fieldControl,\s*\.stage \.countryPicker\s*\{[^}]*background:\s*var\(--color-card-raised\)/,
    );
    expect(reducedMotion?.[0]).toMatch(
      /\.stage \.formPlate\s*\{\s*background:\s*transparent;\s*\}/,
    );
    const forcedColors = heroStylesSource.match(
      /@media \(forced-colors: active\)[\s\S]*?\n\}\n/,
    );
    expect(forcedColors?.[0]).toMatch(
      /\.stage \.fieldControl,\s*\.stage \.countryPicker\s*\{[^}]*background:\s*Canvas/,
    );
    const print = heroStylesSource.match(/@media print[\s\S]*$/);
    expect(print?.[0]).toMatch(
      /\.stage \.formPlate\s*\{\s*background:\s*transparent;\s*\}/,
    );
    expect(print?.[0]).toMatch(
      /\.stage \.fieldControl,\s*\.stage \.countryPicker\s*\{[^}]*background:\s*var\(--color-card-raised\)/,
    );
  });
});

describe('production registration hero preference labels', () => {
  it('keeps the preference label text opaque over bright artwork', () => {
    const labelRule = heroStylesSource.match(
      /\.preferences :global\(label\[for\]\)\s*\{(?<body>[^}]*)\}/,
    );
    expect(labelRule?.groups?.body).toMatch(/color:\s*#fff;/);
    expect(labelRule?.groups?.body).not.toMatch(/rgba\(/);
    expect(labelRule?.groups?.body).toMatch(/font-size:\s*var\(--text-xs\)/);
  });

  it('keeps the language select readable over bright artwork', () => {
    const selectRule = heroStylesSource.match(
      /\.preferences :global\(select\)\s*\{(?<body>[^}]*)\}/,
    );
    const body = selectRule?.groups?.body ?? '';
    expect(body).toMatch(/color:\s*#fff;/);
    // A translucent white fill lets bright artwork through the control and
    // drops the white option text below 4.5:1.
    expect(body).not.toMatch(/background:\s*rgba\(255,\s*255,\s*255/);
    expect(body).toMatch(/background:\s*rgba\(10,\s*11,\s*13,\s*0\.72\);/);
  });
});

describe('production registration phone grouping', () => {
  it('keeps the calling code and national digits in one LTR group', () => {
    expect(PHONE_NUMBER_GROUP_DIRECTION).toBe('ltr');
    expect(PHONE_NUMBER_GROUP_GAP).toBe('var(--space-2)');
    expect(signupFormSource).toContain('dir={PHONE_NUMBER_GROUP_DIRECTION}');
    expect(signupFormSource).toContain('dir="ltr"');
  });

  it('uses exactly one space-2 gap for the phone group', () => {
    const phoneRule = signupStylesSource.match(
      /\.phoneNumber\s*\{(?<body>[^}]*)\}/s,
    )?.groups?.body;
    expect(phoneRule).toBeDefined();
    expect(phoneRule).toMatch(/gap:\s*var\(--space-2\)/);
  });
});

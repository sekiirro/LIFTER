import { modes } from './tokens';

export type Hex = `#${string}`;
export type ModeBrand = {
  fill: Hex;
  onFill: Hex;
  text: Hex;
  ring: Hex;
  fillHover: Hex;
};
export type BrandVariants = {
  light: ModeBrand;
  dark: ModeBrand;
  source: Hex;
  adjusted: boolean;
};
export const DEFAULT_BRAND: Hex = '#059669';
const DARK_LABEL: Hex = '#0B0C0E';

export function parseHex(input: string): Hex | null {
  if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(input)) return null;
  const digits = input.slice(1);
  return `#${(digits.length === 3 ? [...digits].map((v) => v + v).join('') : digits).toUpperCase()}`;
}

const linear = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const srgb = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
const clamp = (v: number) => Math.max(0, Math.min(1, v));

function rgb(hex: Hex): [number, number, number] {
  const normalized = parseHex(hex);
  if (!normalized) throw new TypeError('Expected a hex color');
  return [1, 3, 5].map((i) =>
    linear(parseInt(normalized.slice(i, i + 2), 16) / 255),
  ) as [number, number, number];
}

export function contrastRatio(a: Hex, b: Hex): number {
  const luminance = (hex: Hex) => {
    const [r, g, b] = rgb(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

type Oklch = { l: number; c: number; h: number };
function toOklch(hex: Hex): Oklch {
  const [r, g, b] = rgb(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    c: Math.hypot(a, bb),
    h: Math.atan2(bb, a),
  };
}

// Preserve OKLCH hue/chroma while searching L; clip out-of-gamut sRGB channels.
function fromOklch({ l, c, h }: Oklch): Hex {
  const a = c * Math.cos(h),
    b = c * Math.sin(h);
  const ll = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return `#${[
    4.0767416621 * ll - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * ll + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * ll - 0.7034186147 * m + 1.707614701 * s,
  ]
    .map((v) =>
      Math.round(clamp(srgb(v)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}

function nearest(
  source: Hex,
  passes: (hex: Hex) => boolean,
): { hex: Hex; delta: number } {
  if (passes(source)) return { hex: source, delta: 0 };
  const original = toOklch(source);
  const candidates = [0, 1].flatMap((end) => {
    let passing = end,
      failing = original.l;
    if (!passes(fromOklch({ ...original, l: end }))) return [];
    for (let i = 0; i < 40; i++) {
      const mid = (passing + failing) / 2;
      if (passes(fromOklch({ ...original, l: mid }))) passing = mid;
      else failing = mid;
    }
    return [
      {
        hex: fromOklch({ ...original, l: passing }),
        delta: Math.abs(passing - original.l),
      },
    ];
  });
  const best = candidates.sort((a, b) => a.delta - b.delta)[0];
  if (!best) throw new Error('No contrast-safe lightness found');
  return best;
}

export function deriveBrand(input: string | null | undefined): BrandVariants {
  const source =
    typeof input === 'string'
      ? (parseHex(input) ?? DEFAULT_BRAND)
      : DEFAULT_BRAND;
  function forMode(mode: 'light' | 'dark'): ModeBrand {
    const surface = modes[mode];
    const choices = (['#FFFFFF', DARK_LABEL] as const).map((onFill) => ({
      ...nearest(source, (hex) => contrastRatio(hex, onFill) >= 4.5),
      onFill,
    }));
    const chosen = choices.sort((a, b) => a.delta - b.delta)[0]!;
    const fillLch = toOklch(chosen.hex);
    // Move away from the label's luminance first, then try smaller changes.
    const direction = chosen.onFill === '#FFFFFF' ? -1 : 1;
    const shifted = (shift: number) =>
      fromOklch({ ...fillLch, l: clamp(fillLch.l + shift) });
    const passesHover = (hex: Hex) =>
      hex !== chosen.hex && contrastRatio(hex, chosen.onFill) >= 4.5;
    const hoverCandidates = [0.06, 0.04, 0.02].flatMap((amount) =>
      [direction, -direction].map((sign) => shifted(amount * sign)),
    );
    const fillHover =
      hoverCandidates.find(passesHover) ??
      nearest(shifted(direction * 0.12), passesHover).hex;
    return {
      fill: chosen.hex,
      onFill: chosen.onFill,
      fillHover,
      text: nearest(
        source,
        (hex) =>
          contrastRatio(hex, surface.bg) >= 4.5 &&
          contrastRatio(hex, surface.card) >= 4.5,
      ).hex,
      ring: nearest(
        source,
        (hex) =>
          contrastRatio(hex, surface.bg) >= 3 &&
          contrastRatio(hex, surface.card) >= 3,
      ).hex,
    };
  }
  const light = forMode('light'),
    dark = forMode('dark');
  return {
    source,
    light,
    dark,
    adjusted: [light, dark].some((v) =>
      [v.fill, v.text, v.ring, v.fillHover].some((hex) => hex !== source),
    ),
  };
}

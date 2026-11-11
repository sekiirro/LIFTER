import type { Locale } from '../design/preferences';

export type TierRank = 1 | 2 | 3;

const labels = {
  en: ['Silver', 'Gold', 'Platinum'],
  ar: ['سيلفر', 'جولد', 'بلاتينيوم'],
} as const;

export function tierLabel(rank: TierRank, locale: Locale): string {
  return labels[locale][rank - 1]!;
}

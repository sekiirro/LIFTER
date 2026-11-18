import type { Locale } from '../design/preferences';
import type { PackageMarket, PackageType } from './validation';

const MARKET_LABELS: Record<PackageMarket, Record<Locale, string>> = {
  Egypt: { en: 'Egypt', ar: 'مصر' },
  International: { en: 'International', ar: 'دولي' },
};

const TYPE_LABELS: Record<PackageType, Record<Locale, string>> = {
  'Year-round': { en: 'Year-Round', ar: 'طول السن\u0640ة' },
  Promotional: { en: 'Promotional', ar: 'وقت الع\u0640روض' },
};

export function marketLabel(market: PackageMarket, locale: Locale): string {
  return MARKET_LABELS[market][locale];
}

export function typeLabel(type: PackageType, locale: Locale): string {
  return TYPE_LABELS[type][locale];
}

export function categoryLabel(
  market: PackageMarket,
  type: PackageType,
  locale: Locale,
): string {
  return `${marketLabel(market, locale)} · ${typeLabel(type, locale)}`;
}

import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import {
  dirFor,
  LOCALE_COOKIE,
  parseLocale,
  parseTheme,
  THEME_COOKIE,
} from '../lib/design/preferences';
import { tokensToCss } from '../lib/design/tokens-css';
import './globals.css';
import 'glisse/styles.css';

const geist = localFont({
  src: '../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
  variable: '--font-geist',
  weight: '100 900',
  display: 'swap',
});
const plexArabic = localFont({
  src: [
    {
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-plex-arabic',
  display: 'swap',
});

export const metadata: Metadata = { title: 'LIFTER' };

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const preferences = await cookies();
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(preferences.get(THEME_COOKIE)?.value);
  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      data-theme={theme === 'system' ? undefined : theme}
      className={`${geist.variable} ${plexArabic.variable}`}
    >
      <head>
        <style>{tokensToCss()}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}

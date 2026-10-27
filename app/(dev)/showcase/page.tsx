import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { ThemeSwitcher } from '../../../components/preferences/ThemeSwitcher';
import { LanguageSwitcher } from '../../../components/preferences/LanguageSwitcher';
import { Alert } from '../../../components/ui/Alert';
import { Bidi } from '../../../components/ui/Bidi';
import { BrandScope } from '../../../components/ui/BrandScope';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ToastProvider } from '../../../components/ui/Toast';
import { contrastRatio, deriveBrand } from '../../../lib/design/color';
import {
  LOCALE_COOKIE,
  parseLocale,
  parseTheme,
  THEME_COOKIE,
} from '../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../lib/design/showcase';
import { modes } from '../../../lib/design/tokens';
import { getMessages } from '../../../lib/i18n';
import { ComponentDemos } from './ComponentDemos';
import styles from './showcase.module.css';

const samples = [
  '#059669',
  '#FFFF00',
  '#FFFFFF',
  '#000000',
  '#E11D48',
  '#2563EB',
  '#7C3AED',
  '#F59E0B',
  '#14B8A6',
];
const swatches = [
  ...[
    'bg',
    'card',
    'card-raised',
    'border',
    'border-strong',
    'text',
    'text-muted',
    'text-disabled',
    'overlay',
  ].map((key) => `--color-${key}`),
  ...['success', 'warning', 'error', 'info'].flatMap((tone) =>
    ['fg', 'bg', 'border'].map((key) => `--color-${tone}-${key}`),
  ),
  ...['fill', 'fill-hover', 'on-fill', 'text', 'ring'].map(
    (key) => `--brand-${key}`,
  ),
];

export default async function ShowcasePage() {
  if (!isShowcaseEnabled(process.env)) notFound();
  const preferences = await cookies();
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(preferences.get(THEME_COOKIE)?.value);
  const m = getMessages(locale);
  return (
    <ToastProvider dismissLabel={m['toast.dismiss']}>
      <main className={styles.main} data-testid="showcase">
        <header className={styles.header}>
          <h1>{m['showcase.title']}</h1>
          <p>{m['showcase.intro']}</p>
        </header>
        <section
          id="preferences"
          aria-labelledby="preferences-title"
          className={styles.section}
        >
          <h2 id="preferences-title">{m['showcase.preferences']}</h2>
          <div className={styles.grid}>
            <ThemeSwitcher
              key={theme}
              value={theme}
              label={m['theme.label']}
              labels={{
                system: m['theme.system'],
                dark: m['theme.dark'],
                light: m['theme.light'],
              }}
            />
            <LanguageSwitcher
              value={locale}
              label={m['language.label']}
              labels={{ ar: m['language.ar'], en: m['language.en'] }}
            />
          </div>
        </section>
        <section
          id="tokens"
          aria-labelledby="tokens-title"
          className={styles.section}
        >
          <h2 id="tokens-title">{m['showcase.tokens']}</h2>
          <div className={styles.swatches}>
            {swatches.map((variable) => (
              <Card key={variable}>
                <span
                  aria-hidden="true"
                  className={styles.swatch}
                  style={{ '--swatch': `var(${variable})` } as CSSProperties}
                />
                <Bidi dir="ltr">
                  <code>{variable}</code>
                </Bidi>
              </Card>
            ))}
          </div>
        </section>
        <section
          id="typography"
          aria-labelledby="typography-title"
          className={styles.section}
        >
          <h2 id="typography-title">{m['showcase.typography']}</h2>
          <Card>
            <p lang="ar" dir="rtl" className={styles.typeSample}>
              {m['showcase.arabicSample']}
            </p>
            <p lang="en" dir="ltr" className={styles.typeSample}>
              {m['showcase.englishSample']}
            </p>
          </Card>
        </section>
        <section
          id="bidi"
          aria-labelledby="bidi-title"
          className={styles.section}
        >
          <h2 id="bidi-title">{m['showcase.bidi']}</h2>
          <p lang="ar" dir="rtl">
            {m['showcase.weight']}{' '}
            <Bidi dir="ltr">{m['showcase.measurement']}</Bidi> —{' '}
            <Bidi dir="ltr">{m['showcase.code']}</Bidi>
          </p>
        </section>
        <section
          id="authored-content"
          aria-labelledby="authored-title"
          className={styles.section}
        >
          <h2 id="authored-title">{m['showcase.authoredContent']}</h2>
          <Card>
            <p dir="auto">{m['showcase.authoredSample']}</p>
          </Card>
        </section>
        <section
          id="brands"
          aria-labelledby="brands-title"
          className={styles.section}
        >
          <h2 id="brands-title">{m['showcase.brands']}</h2>
          <div className={styles.stack}>
            {samples.map((color) => {
              const brand = deriveBrand(color);
              return (
                <BrandScope
                  key={color}
                  color={color}
                  data-testid={`brand-${color.slice(1)}`}
                  className={styles.brand}
                >
                  <h3>
                    <Bidi>{color}</Bidi>
                  </h3>
                  <div className={styles.row}>
                    <Button data-testid="brand-button">
                      {m['button.primary']}
                    </Button>
                    <a className={styles.brandLink} href="#brands">
                      {m['showcase.brandLink']}
                    </a>
                    <a
                      className={styles.activeChip}
                      href="#brands"
                      aria-current="page"
                    >
                      {m['showcase.activeNav']}
                    </a>
                  </div>
                  <div className={styles.stack}>
                    {(['success', 'warning', 'error'] as const).map((tone) => (
                      <Alert
                        key={tone}
                        tone={tone}
                        title={m[`showcase.${tone}`]}
                        data-testid={`brand-${tone}`}
                      />
                    ))}
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <caption className={styles.caption}>
                        {m['showcase.contrast']}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">{m['showcase.mode']}</th>
                          <th scope="col">{m['showcase.variant']}</th>
                          <th scope="col">{m['showcase.hex']}</th>
                          <th scope="col">{m['showcase.contrast']}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(['light', 'dark'] as const).flatMap((mode) => {
                          const b = brand[mode],
                            surface = modes[mode];
                          return [
                            {
                              key: 'fill',
                              label: m['showcase.fill'],
                              hex: `${b.fill} / ${b.onFill}`,
                              ratio: contrastRatio(b.fill, b.onFill),
                            },
                            {
                              key: 'fillHover',
                              label: m['showcase.fillHover'],
                              hex: b.fillHover,
                              ratio: contrastRatio(b.fillHover, b.onFill),
                            },
                            {
                              key: 'textBg',
                              label: m['showcase.textBg'],
                              hex: b.text,
                              ratio: contrastRatio(b.text, surface.bg),
                            },
                            {
                              key: 'textCard',
                              label: m['showcase.textCard'],
                              hex: b.text,
                              ratio: contrastRatio(b.text, surface.card),
                            },
                            {
                              key: 'ring',
                              label: m['showcase.ring'],
                              hex: b.ring,
                              ratio: contrastRatio(b.ring, surface.bg),
                            },
                          ].map((row) => (
                            <tr key={`${mode}-${row.key}`}>
                              <td>{m[`theme.${mode}`]}</td>
                              <th scope="row">{row.label}</th>
                              <td>
                                <Bidi dir="ltr">{row.hex}</Bidi>
                              </td>
                              <td>
                                <Bidi dir="ltr">{row.ratio.toFixed(2)}:1</Bidi>
                              </td>
                            </tr>
                          ));
                        })}
                      </tbody>
                    </table>
                  </div>
                </BrandScope>
              );
            })}
          </div>
        </section>
        <ComponentDemos messages={m} />
      </main>
    </ToastProvider>
  );
}

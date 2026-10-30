import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Bidi } from '../../../../../components/ui/Bidi';
import {
  LOCALE_COOKIE,
  parseLocale,
  THEME_COOKIE,
  parseTheme,
} from '../../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../../lib/design/showcase';
import { getMessages } from '../../../../../lib/i18n';
import styles from './page.module.css';

export default async function HeroGuidancePrototypePage() {
  if (!isShowcaseEnabled(process.env) || process.env.NODE_ENV === 'production')
    notFound();
  const preferences = await cookies();
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(preferences.get(THEME_COOKIE)?.value);
  const messages = getMessages(locale);
  return (
    <main
      className={styles.guidance}
      data-testid="hero-guidance"
      data-copy-status="draft"
    >
      <h1 className={styles.srOnly}>{messages['f14Hero.desktopLabel']}</h1>
      <p>
        <span>{messages['f14Hero.desktopLabel']}</span>{' '}
        <Bidi dir="ltr">{messages['f14Hero.desktopDimensions']}</Bidi>.{' '}
        {messages['f14Hero.desktopAdviceBefore']}
        <Bidi dir="ltr">{messages['f14Hero.desktopPercent']}</Bidi>
        {messages['f14Hero.desktopAdviceAfter']}
      </p>
      <p>
        <span>{messages['f14Hero.mobileLabel']}</span>{' '}
        <Bidi dir="ltr">{messages['f14Hero.mobileDimensions']}</Bidi>.{' '}
        {messages['f14Hero.mobileAdviceBefore']}
        <Bidi dir="ltr">{messages['f14Hero.mobilePercent']}</Bidi>
        {messages['f14Hero.mobileAdviceAfter']}
      </p>
      <span className={styles.srOnly} data-testid="active-theme">
        {theme}
      </span>
    </main>
  );
}

import type { ReactNode } from 'react';
import { Card } from '../../../../components/ui/Card';
import styles from './page.module.css';
import glass from './liquid-glass.module.css';

/**
 * Showcase-only registration shell. Keep the material class API in
 * liquid-glass.module.css self-contained so it can be promoted unchanged
 * after Product Owner sign-off.
 */
export function HeroGlassCard({
  children,
  locale,
}: {
  children: ReactNode;
  locale: 'ar' | 'en';
}) {
  return (
    <div className={styles.glassFrame}>
      <Card
        as="article"
        className={`${styles.glassCard} ${glass.liquidGlassStrong}`}
        data-testid="hero-glass-card"
        data-material="liquid-glass-strong"
        data-locale={locale}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        <div className={styles.glassContent} data-testid="hero-glass-content">
          {children}
        </div>
      </Card>
    </div>
  );
}

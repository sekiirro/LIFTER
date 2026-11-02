import Link from 'next/link';
import { Icon } from '../icons/Icon';
import { GlassSurface } from '../ui/glass/GlassSurface';
import type { ShellNavigationProps } from './AppShell';
import styles from './BottomBar.module.css';

export function BottomBar({
  items,
  activeKey,
  hrefFor = (key) => `#${key}`,
  messages,
  className,
}: ShellNavigationProps) {
  return (
    <GlassSurface
      variant="regular"
      role="navigation"
      aria-label={messages['nav.label']}
      data-testid="bottom-bar"
      data-screen-only=""
      className={[styles.bar, className].filter(Boolean).join(' ')}
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={hrefFor(item.key)}
          className={styles.link}
          aria-current={activeKey === item.key ? 'page' : undefined}
          data-nav-key={item.key}
        >
          <Icon name={item.icon} />
          <span data-testid="bottom-label">{messages[item.labelKey]}</span>
        </Link>
      ))}
    </GlassSurface>
  );
}

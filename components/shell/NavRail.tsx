import { Icon } from '../icons/Icon';
import { GlassSurface } from '../ui/glass/GlassSurface';
import type { ShellNavigationProps } from './AppShell';
import styles from './NavRail.module.css';

export function NavRail({
  items,
  activeKey,
  hrefFor = (key) => `#${key}`,
  messages,
  className,
}: ShellNavigationProps) {
  return (
    <GlassSurface
      variant="solid"
      fallback="solid"
      role="navigation"
      aria-label={messages['nav.label']}
      data-testid="nav-rail"
      data-screen-only=""
      className={[styles.rail, className].filter(Boolean).join(' ')}
    >
      {items.map((item) => (
        <a
          key={item.key}
          href={hrefFor(item.key)}
          className={styles.link}
          aria-label={messages[item.labelKey]}
          aria-current={activeKey === item.key ? 'page' : undefined}
          data-nav-key={item.key}
        >
          <Icon name={item.icon} />
          <span
            aria-hidden="true"
            className={styles.tooltip}
            data-testid={`tooltip-${item.key}`}
          >
            {messages[item.labelKey]}
          </span>
        </a>
      ))}
    </GlassSurface>
  );
}

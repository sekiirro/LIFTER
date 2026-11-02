import Link from 'next/link';
import { Icon } from '../icons/Icon';
import { GlassSurface } from '../ui/glass/GlassSurface';
import type { ShellNavigationProps } from './AppShell';
import { AccessibleTooltip } from './AccessibleTooltip';
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
      variant="regular"
      fallback="auto"
      role="navigation"
      aria-label={messages['nav.label']}
      data-testid="nav-rail"
      data-screen-only=""
      className={[styles.rail, className].filter(Boolean).join(' ')}
    >
      <div className={styles.links} data-nav-scroll="">
        {items
          .filter((item) => item.key !== 'more')
          .map((item) => (
            <AccessibleTooltip
              key={item.key}
              label={messages[item.labelKey]}
              tooltipTestId={`tooltip-${item.key}`}
              portalToBody
            >
              <Link
                href={hrefFor(item.key)}
                className={styles.link}
                aria-label={messages[item.labelKey]}
                aria-current={activeKey === item.key ? 'page' : undefined}
                data-nav-key={item.key}
              >
                <Icon name={item.icon} />
              </Link>
            </AccessibleTooltip>
          ))}
      </div>
    </GlassSurface>
  );
}

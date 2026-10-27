import type { CSSProperties } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { Button } from './Button';
import styles from './States.module.css';

export function Skeleton({
  shape = 'text',
  lines = 3,
}: {
  shape?: 'text' | 'circle' | 'card';
  lines?: number;
}) {
  return (
    <div aria-hidden="true" className={styles.skeletonGroup}>
      {Array.from(
        { length: shape === 'text' ? Math.max(1, Math.floor(lines)) : 1 },
        (_, index) => (
          <span
            key={index}
            className={[styles.skeleton, styles[shape]].join(' ')}
            style={
              {
                '--skeleton-width':
                  shape === 'text' && index === lines - 1 ? '70%' : '100%',
              } as CSSProperties
            }
          />
        ),
      )}
    </div>
  );
}

type StateProps = { title: string; description?: string };
function State({
  title,
  description,
  icon,
  children,
  alert = false,
}: StateProps & {
  icon: IconName;
  children?: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div className={styles.state} role={alert ? 'alert' : undefined}>
      <Icon name={icon} />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
export function EmptyState(props: StateProps) {
  return <State {...props} icon="inbox" />;
}
export function NoResults(props: StateProps) {
  return <State {...props} icon="search" />;
}
export function ErrorState({
  onRetry,
  retryLabel,
  ...props
}: StateProps & { onRetry: () => void; retryLabel: string }) {
  return (
    <State {...props} icon="x-circle" alert>
      <Button variant="secondary" onClick={onRetry} data-testid="retry-button">
        {retryLabel}
      </Button>
    </State>
  );
}

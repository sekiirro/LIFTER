import type { HTMLAttributes } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import styles from './Alert.module.css';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';
const icons: Record<AlertTone, IconName> = {
  info: 'info',
  success: 'check',
  warning: 'alert-triangle',
  error: 'x-circle',
};

export function Alert({
  tone,
  title,
  children,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  tone: AlertTone;
  title: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      {...props}
      className={[styles.alert, styles[tone], className]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon name={icons[tone]} />
      <div>
        <p className={styles.title}>{title}</p>
        {children}
      </div>
    </div>
  );
}

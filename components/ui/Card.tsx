import type { HTMLAttributes } from 'react';
import styles from './Card.module.css';

export function Card({
  as: Tag = 'div',
  elevated = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'article' | 'section';
  elevated?: boolean;
}) {
  return (
    <Tag
      {...props}
      className={[styles.card, elevated && styles.elevated, className]
        .filter(Boolean)
        .join(' ')}
    />
  );
}

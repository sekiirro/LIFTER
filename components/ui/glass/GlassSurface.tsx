import type { ElementType, HTMLAttributes } from 'react';
import styles from './GlassSurface.module.css';

export type GlassVariant = 'regular' | 'strong' | 'edge';
export type GlassFallback = 'auto' | 'solid';

export type GlassSurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  variant?: GlassVariant;
  fallback?: GlassFallback;
};

export function getGlassSurfaceClassName({
  variant = 'regular',
  fallback = 'auto',
  className,
}: Pick<GlassSurfaceProps, 'variant' | 'fallback' | 'className'> = {}) {
  return [
    styles.surface,
    'lg-glass',
    styles[variant],
    fallback === 'solid' ? styles.solid : undefined,
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function GlassSurface({
  as: Component = 'div',
  variant = 'regular',
  fallback = 'auto',
  className,
  ...props
}: GlassSurfaceProps) {
  return (
    <Component
      {...props}
      className={getGlassSurfaceClassName({ variant, fallback, className })}
      data-glass-surface=""
      data-glass-variant={variant}
      data-glass-fallback={fallback}
    />
  );
}

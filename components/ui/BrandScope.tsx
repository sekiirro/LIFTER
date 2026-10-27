import type { CSSProperties, HTMLAttributes } from 'react';
import { deriveBrand } from '../../lib/design/color';
import { brandToCssVars } from '../../lib/design/tokens-css';

export function BrandScope({
  color,
  children,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { color?: string }) {
  return (
    <div
      {...props}
      data-brand-scope=""
      style={
        { ...style, ...brandToCssVars(deriveBrand(color)) } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  getGlassSurfaceClassName,
  GlassSurface,
} from '../../components/ui/glass/GlassSurface';

describe('GlassSurface', () => {
  it('selects the requested material class and defaults to regular', () => {
    expect(getGlassSurfaceClassName()).toContain('regular');
    expect(getGlassSurfaceClassName({ variant: 'strong' })).toContain('strong');
    expect(getGlassSurfaceClassName({ variant: 'edge' })).toContain('edge');
  });

  it('selects the opaque fallback class when requested', () => {
    const automatic = getGlassSurfaceClassName({ fallback: 'auto' });
    const opaque = getGlassSurfaceClassName({ fallback: 'solid' });

    expect(automatic).not.toContain('solid');
    expect(opaque).toContain('solid');
  });

  it('forwards semantic props and preserves caller classes', () => {
    const html = renderToStaticMarkup(
      <GlassSurface
        as="nav"
        aria-label="Primary navigation"
        className="test-class"
        data-testid="glass-nav"
      >
        Links
      </GlassSurface>,
    );

    expect(html).toContain('<nav');
    expect(html).toContain('aria-label="Primary navigation"');
    expect(html).toContain('data-testid="glass-nav"');
    expect(html).toContain('data-glass-variant="regular"');
    expect(html).toContain('data-glass-fallback="auto"');
    expect(html).toContain('test-class');
    expect(html).toContain('Links</nav>');
  });
});

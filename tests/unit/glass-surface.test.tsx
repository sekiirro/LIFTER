import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  getGlassSurfaceClassName,
  GlassSurface,
  shouldEnableGlisseRefraction,
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

  it('forces an opaque fallback to disable prefixed and unprefixed backdrop filters', () => {
    const html = renderToStaticMarkup(
      <GlassSurface fallback="solid" style={{ opacity: 0.9, color: 'red' }} />,
    );

    expect(html).toContain('backdrop-filter:none');
    expect(html).toContain('-webkit-backdrop-filter:none');
    expect(html).toContain('opacity:0.9');
    expect(html).toContain('color:red');
  });

  it('forwards semantic props and preserves caller classes', () => {
    const html = renderToStaticMarkup(
      <GlassSurface
        role="navigation"
        aria-label="Primary navigation"
        className="test-class"
        data-testid="glass-nav"
      >
        Links
      </GlassSurface>,
    );

    expect(html).toContain('<div');
    expect(html).toContain('role="navigation"');
    expect(html).toContain('aria-label="Primary navigation"');
    expect(html).toContain('data-testid="glass-nav"');
    expect(html).toContain('data-glass-variant="regular"');
    expect(html).toContain('data-glass-fallback="auto"');
    expect(html).toContain('test-class');
    expect(html).toContain('Links</div>');
  });

  it('enables refraction only when the browser and preferences allow it', () => {
    const supported = {
      supportsBackdropFilter: true,
      reducedTransparency: false,
      increasedContrast: false,
      forcedColors: false,
      reducedMotion: false,
      constrainedDevice: false,
    };

    expect(shouldEnableGlisseRefraction(supported)).toBe(true);
    expect(
      shouldEnableGlisseRefraction({
        ...supported,
        supportsBackdropFilter: false,
      }),
    ).toBe(false);
    expect(
      shouldEnableGlisseRefraction({ ...supported, reducedTransparency: true }),
    ).toBe(false);
    expect(
      shouldEnableGlisseRefraction({ ...supported, increasedContrast: true }),
    ).toBe(false);
    expect(
      shouldEnableGlisseRefraction({ ...supported, forcedColors: true }),
    ).toBe(false);
    expect(
      shouldEnableGlisseRefraction({ ...supported, reducedMotion: true }),
    ).toBe(false);
    expect(shouldEnableGlisseRefraction(supported, 'solid')).toBe(false);
    expect(
      shouldEnableGlisseRefraction({ ...supported, constrainedDevice: true }),
    ).toBe(false);
  });
});

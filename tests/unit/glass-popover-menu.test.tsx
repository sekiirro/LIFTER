import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  GlassFab,
  GlassToolbarButton,
} from '../../components/ui/glass/GlassActions';
import {
  getGlassMenuKeyAction,
  GlassPopoverMenu,
} from '../../components/ui/glass/GlassPopoverMenu';

describe('Glass popover menu keyboard model', () => {
  it('moves focus with arrows and wraps at either end', () => {
    expect(getGlassMenuKeyAction('ArrowDown', 1, 3)).toEqual({
      type: 'focus',
      index: 2,
    });
    expect(getGlassMenuKeyAction('ArrowDown', 2, 3)).toEqual({
      type: 'focus',
      index: 0,
    });
    expect(getGlassMenuKeyAction('ArrowUp', 0, 3)).toEqual({
      type: 'focus',
      index: 2,
    });
  });

  it('supports Home and End and closes without trapping Tab', () => {
    expect(getGlassMenuKeyAction('Home', 2, 3)).toEqual({
      type: 'focus',
      index: 0,
    });
    expect(getGlassMenuKeyAction('End', 0, 3)).toEqual({
      type: 'focus',
      index: 2,
    });
    expect(getGlassMenuKeyAction('Tab', 0, 3)).toEqual({ type: 'close' });
  });

  it('returns focus to the trigger on Escape', () => {
    expect(getGlassMenuKeyAction('Escape', 0, 3)).toEqual({
      type: 'restore-trigger',
    });
  });

  it('activates the focused item with Space', () => {
    expect(getGlassMenuKeyAction(' ', 1, 3)).toEqual({ type: 'activate' });
  });

  it('keeps the menu closed in server markup and exposes an accessible trigger', () => {
    const html = renderToStaticMarkup(
      <GlassPopoverMenu
        label="Registration links menu"
        triggerLabel="Links"
        trigger="Links"
        items={[{ label: 'Recent links', href: '#recent' }]}
      />,
    );
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
  });
});

describe('glass action samples', () => {
  it('renders named toolbar and floating actions with a solid fallback option', () => {
    const toolbar = renderToStaticMarkup(
      <GlassToolbarButton aria-label="Secondary action" fallback="solid">
        More
      </GlassToolbarButton>,
    );
    const fab = renderToStaticMarkup(
      <GlassFab aria-label="Add sample">+</GlassFab>,
    );
    expect(toolbar).toContain('aria-label="Secondary action"');
    expect(toolbar).toContain('data-glass-fallback="solid"');
    expect(fab).toContain('aria-label="Add sample"');
  });
});

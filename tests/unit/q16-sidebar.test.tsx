import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', async () => {
  const React = await import('react');
  return {
    default: ({ children, ...props }: React.ComponentProps<'a'>) =>
      React.createElement('a', { ...props, 'data-next-link': '' }, children),
  };
});

import { createTooltipController } from '../../components/shell/AccessibleTooltip';
import { NavRail } from '../../components/shell/NavRail';
import {
  GlassSurface,
  shouldEnableGlisseRefraction,
} from '../../components/ui/glass/GlassSurface';
import { getNavigation } from '../../lib/design/navigation';
import { getMessages } from '../../lib/i18n';

/**
 * T048 / FR-021 / FR-028 / SC-009 / SC-010 unit-level verification of the
 * Q16 sidebar: logical (RTL/LTR) placement, icons-only default, hover and
 * keyboard-focus tooltips, and the glass static/solid fallback.
 * Browser-level evidence lives in shell-q16.spec.ts and
 * shell-fallback-matrix.spec.ts.
 */
const appShellCss = readFileSync(
  new URL('../../components/shell/AppShell.module.css', import.meta.url),
  'utf8',
);
const navRailCss = readFileSync(
  new URL('../../components/shell/NavRail.module.css', import.meta.url),
  'utf8',
);

const supported = {
  supportsBackdropFilter: true,
  reducedTransparency: false,
  increasedContrast: false,
  forcedColors: false,
  reducedMotion: false,
};

describe('T048 Q16 sidebar (unit verification)', () => {
  it('uses logical inline-start placement and a 64rem breakpoint (RTL/LTR)', () => {
    // The rail is positioned with a direction-relative property (left in LTR,
    // right in RTL) rather than a physical left/right value.
    expect(appShellCss).toMatch(/\.rail\s*\{[^}]*inset-inline-start:/);
    expect(appShellCss).not.toMatch(/\.rail\s*\{[^}]*\b(?:left|right):/);
    expect(appShellCss).toContain('@media (min-width: 64rem)');
    // Vertical stack (not a horizontal bottom dock).
    expect(navRailCss).toMatch(/\.rail\s*\{[^}]*flex-direction:\s*column/);
    expect(navRailCss).toMatch(/\.links\s*\{[^}]*flex-direction:\s*column/);
  });

  it.each(['trainer', 'client'] as const)(
    '%s rail is icons-only by default with accessible names and hidden tooltips',
    (role) => {
      const navigation = getNavigation(role);
      if (navigation.status !== 'defined') throw new Error('Expected role nav');
      const messages = getMessages('en');
      const html = renderToStaticMarkup(
        <NavRail
          items={navigation.items}
          activeKey="home"
          messages={messages}
        />,
      );

      expect(html).toContain('data-testid="nav-rail"');
      expect(html).toContain('role="navigation"');
      expect(html).toContain(messages['nav.label']);
      // "More" belongs to the bottom bar, never to the vertical rail.
      expect(html).not.toContain('data-nav-key="more"');
      expect(html.match(/data-nav-key=/g)).toHaveLength(4);
      // Exactly one icon and no visible label text for every destination.
      expect(html.match(/<svg/g)).toHaveLength(4);
      // All tooltips start hidden and only appear on hover/focus.
      expect(html.match(/data-visible="false"/g)).toHaveLength(4);
      expect(html.match(/role="tooltip" aria-hidden="true"/g)).toHaveLength(4);
      expect(html.match(/role="tooltip"/g)).toHaveLength(4);
    },
  );

  it('reveals the tooltip on pointer hover and keyboard focus, and hides on leave/blur/Escape', () => {
    vi.useFakeTimers();
    try {
      const states: boolean[] = [];
      const controller = createTooltipController((visible) =>
        states.push(visible),
      );

      // Mouse hover is debounced, then shows the tooltip.
      controller.pointerEnter('mouse');
      expect(states).toEqual([]);
      vi.advanceTimersByTime(300);
      expect(states).toEqual([true]);

      controller.pointerLeave();
      expect(states.at(-1)).toBe(false);

      // Touch pointers never trigger hover tooltips.
      controller.pointerEnter('touch');
      vi.advanceTimersByTime(300);
      expect(states.filter(Boolean)).toHaveLength(1);

      // Keyboard focus shows immediately; blur and Escape hide it.
      controller.focusVisible();
      expect(states.at(-1)).toBe(true);
      controller.escape();
      expect(states.at(-1)).toBe(false);
      controller.focusVisible();
      controller.blur();
      expect(states.at(-1)).toBe(false);
      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('selects the static/solid glass fallback while keeping navigation semantics', () => {
    expect(shouldEnableGlisseRefraction(supported)).toBe(true);
    for (const override of [
      { supportsBackdropFilter: false },
      { reducedTransparency: true },
      { increasedContrast: true },
      { forcedColors: true },
      { reducedMotion: true },
      { constrainedDevice: true },
    ]) {
      expect(shouldEnableGlisseRefraction({ ...supported, ...override })).toBe(
        false,
      );
    }
    expect(shouldEnableGlisseRefraction(supported, 'solid')).toBe(false);

    const html = renderToStaticMarkup(
      <GlassSurface
        fallback="solid"
        role="navigation"
        aria-label="navigation"
        data-testid="nav-rail"
      />,
    );
    expect(html).toContain('data-glass-fallback="solid"');
    expect(html).toContain('backdrop-filter:none');
    expect(html).toContain('-webkit-backdrop-filter:none');
    expect(html).toContain('role="navigation"');
    expect(html).toContain('data-testid="nav-rail"');
  });
});

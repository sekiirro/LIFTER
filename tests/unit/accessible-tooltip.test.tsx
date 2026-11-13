import { readFileSync } from 'node:fs';
import Link from 'next/link';
import { act } from 'react';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AccessibleTooltip,
  createTooltipController,
  getTooltipAriaAttributes,
} from '../../components/shell/AccessibleTooltip';

describe('AccessibleTooltip behavior', () => {
  afterEach(() => vi.useRealTimers());

  it('waits 300 ms for hover and ignores touch pointers', () => {
    vi.useFakeTimers();
    const onVisibilityChange = vi.fn();
    const tooltip = createTooltipController(onVisibilityChange);

    tooltip.pointerEnter('mouse');
    expect(onVisibilityChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(299);
    expect(onVisibilityChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onVisibilityChange).toHaveBeenLastCalledWith(true);

    onVisibilityChange.mockClear();
    tooltip.pointerLeave();
    tooltip.pointerEnter('touch');
    vi.advanceTimersByTime(300);
    expect(onVisibilityChange).toHaveBeenCalledTimes(1);
    expect(onVisibilityChange).toHaveBeenCalledWith(false);
    tooltip.dispose();
  });

  it('shows immediately for focus-visible and hides on Escape, blur, or pointer leave', () => {
    const onVisibilityChange = vi.fn();
    const tooltip = createTooltipController(onVisibilityChange);

    tooltip.focusVisible();
    expect(onVisibilityChange).toHaveBeenLastCalledWith(true);
    tooltip.escape();
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
    tooltip.focusVisible();
    tooltip.blur();
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
    tooltip.focusVisible();
    tooltip.pointerLeave();
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps an accessible name and wires the visible tooltip as a description', () => {
    expect(
      getTooltipAriaAttributes('Clients', 'Clients', 'tip-1', false),
    ).toEqual({
      'aria-label': 'Clients',
      'aria-describedby': undefined,
    });
    expect(
      getTooltipAriaAttributes(
        'Clients',
        'Client actions',
        'tip-1',
        true,
        'help-1',
      ),
    ).toEqual({
      'aria-label': 'Clients',
      'aria-describedby': 'help-1 tip-1',
    });

    const html = renderToStaticMarkup(
      <AccessibleTooltip label="Clients" tooltipTestId="tooltip-clients">
        <Link href="/clients">
          <svg aria-hidden="true" />
        </Link>
      </AccessibleTooltip>,
    );
    expect(html).toContain('aria-label="Clients"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('data-testid="tooltip-clients"');
    expect(html).toContain('data-visible="false"');
  });

  it('avoids repeating a tooltip that matches the trigger accessible name', () => {
    expect(getTooltipAriaAttributes('Home', 'Home', 'tip-home', true)).toEqual({
      'aria-label': 'Home',
      'aria-describedby': undefined,
    });
    expect(
      getTooltipAriaAttributes('Home', 'Home help', 'tip-home', true),
    ).toEqual({ 'aria-label': 'Home', 'aria-describedby': 'tip-home' });
  });

  it('hydrates the body portal without logging a hydration error', async () => {
    const element = (
      <AccessibleTooltip label="Home" tooltipTestId="tooltip-home" portalToBody>
        <a href="#home" aria-label="Home">
          Home
        </a>
      </AccessibleTooltip>
    );
    const markup = renderToString(element);
    const dom = new JSDOM(`<div id="root">${markup}</div>`, {
      url: 'http://localhost/',
    });
    const previousGlobals = new Map<string, PropertyDescriptor | undefined>(
      [
        'window',
        'document',
        'HTMLElement',
        'Node',
        'IS_REACT_ACT_ENVIRONMENT',
      ].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
    );
    for (const [key, value] of Object.entries({
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      Node: dom.window.Node,
      IS_REACT_ACT_ENVIRONMENT: true,
    }))
      Object.defineProperty(globalThis, key, {
        configurable: true,
        value,
      });

    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const recoverableErrors: unknown[] = [];
    let root: Awaited<
      ReturnType<typeof import('react-dom/client').hydrateRoot>
    > | null = null;
    try {
      const { hydrateRoot } = await import('react-dom/client');
      await act(async () => {
        root = hydrateRoot(
          dom.window.document.getElementById('root')!,
          element,
          {
            onRecoverableError: (error) => recoverableErrors.push(error),
          },
        );
      });

      expect(consoleError).not.toHaveBeenCalled();
      expect(recoverableErrors).toEqual([]);
      const tooltip = dom.window.document.querySelector(
        '[data-testid="tooltip-home"]',
      );
      expect(tooltip?.parentElement).toBe(dom.window.document.body);
    } finally {
      if (root) await act(async () => root?.unmount());
      consoleError.mockRestore();
      for (const [key, descriptor] of previousGlobals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
      dom.window.close();
    }
  });

  it('anchors outside the fixed 44px trigger footprint without shifting the dock', () => {
    const css = readFileSync(
      new URL(
        '../../components/shell/AccessibleTooltip.module.css',
        import.meta.url,
      ),
      'utf8',
    );

    expect(css).toContain('position: relative');
    expect(css).toContain('display: inline-grid');
    expect(css).toContain('inline-size: var(--touch-min)');
    expect(css).toContain('block-size: var(--touch-min)');
    expect(css).toContain('.trigger > :first-child');
    expect(css).toContain('inline-size: 100%');
    expect(css).toContain('block-size: 100%');
    expect(css).toContain('position: absolute');
    expect(css).toContain('inset-inline-start: calc(100% + var(--space-3))');
    expect(css).toContain('background: #111827');
    expect(css).toContain('color: #fff');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

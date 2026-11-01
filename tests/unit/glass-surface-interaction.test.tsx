// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlassPopoverMenu } from '../../components/ui/glass/GlassPopoverMenu';
import { GlassSurface } from '../../components/ui/glass/GlassSurface';

const glisseTest = vi.hoisted(() => ({
  onMount: () => {},
  loadGate: undefined as undefined | (() => Promise<void>),
}));

vi.mock('glisse', async () => {
  await glisseTest.loadGate?.();
  const React = await import('react');
  return {
    Glass: React.forwardRef(function MockGlass(props, ref) {
      glisseTest.onMount();
      return React.createElement('div', { ...props, ref });
    }),
    useGlisseRefraction: () => glisseTest.onMount(),
  };
});

function prepareEnhancementEnvironment() {
  vi.stubGlobal('CSS', { supports: () => true });
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      static supportedEntryTypes: string[] = [];
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    value: 'complete',
  });
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    configurable: true,
    value: 8,
  });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    {} as DOMRect,
  ] as unknown as DOMRectList);
  const requestFrame = (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16);
  vi.stubGlobal('requestAnimationFrame', requestFrame);
  window.requestAnimationFrame = requestFrame;
}

async function waitForEnhancement() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 3600));
  });
}

async function waitForSettlement() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 800));
  });
}

function markRecentInteraction() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  glisseTest.onMount = () => {};
  glisseTest.loadGate = undefined;
});

describe('GlassSurface keeps its child subtree mounted during runtime changes', () => {
  it('preserves focused child node identity when an over-budget enhancement falls back', async () => {
    prepareEnhancementEnvironment();
    let releaseImport!: () => void;
    let markImportStarted!: () => void;
    const importStarted = new Promise<void>((resolve) => {
      markImportStarted = resolve;
    });
    const importGate = new Promise<void>((resolve) => {
      releaseImport = resolve;
    });
    glisseTest.loadGate = () => {
      markImportStarted();
      return importGate;
    };
    render(
      <GlassSurface data-testid="surface">
        <a href="#child">Focusable child</a>
      </GlassSurface>,
    );
    const link = screen.getByRole('link', { name: 'Focusable child' });
    link.focus();
    markRecentInteraction();

    await importStarted;
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    releaseImport();
    await waitFor(() =>
      expect(
        screen.getByTestId('surface').hasAttribute('data-glass-enhanced'),
      ).toBe(true),
    );
    await waitForSettlement();

    expect(
      screen.getByTestId('surface').getAttribute('data-glass-runtime'),
    ).toBe('static');
    expect(
      screen.getByTestId('surface').hasAttribute('data-glass-over-budget'),
    ).toBe(true);
    expect(document.activeElement).toBe(link);
    expect(screen.getByRole('link')).toBe(link);
  });

  it('preserves focused child node identity when enhancement completes', async () => {
    prepareEnhancementEnvironment();
    render(
      <GlassSurface data-testid="surface">
        <a href="#child">Focusable child</a>
      </GlassSurface>,
    );
    const link = screen.getByRole('link', { name: 'Focusable child' });
    link.focus();
    markRecentInteraction();

    await waitForEnhancement();

    expect(
      screen.getByTestId('surface').getAttribute('data-glass-runtime'),
    ).toBe('enhanced');
    expect(document.activeElement).toBe(link);
    expect(screen.getByRole('link')).toBe(link);
  });

  it('keeps popover arrow-key navigation working after the enhancement window', async () => {
    prepareEnhancementEnvironment();
    render(
      <GlassPopoverMenu
        label="Actions"
        triggerLabel="Open actions"
        trigger="Open"
        items={[
          { label: 'First action', href: '#first' },
          { label: 'Second action', href: '#second' },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open actions' }));
    const first = screen.getByRole('menuitem', { name: 'First action' });
    const second = screen.getByRole('menuitem', { name: 'Second action' });
    await act(
      async () => new Promise((resolve) => window.setTimeout(resolve, 20)),
    );
    expect(document.activeElement).toBe(first);
    markRecentInteraction();

    await waitForEnhancement();

    expect(screen.getByRole('menu').getAttribute('data-glass-runtime')).toBe(
      'enhanced',
    );
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(second);
  });
});

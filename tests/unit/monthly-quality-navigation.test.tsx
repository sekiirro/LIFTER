/** @vitest-environment happy-dom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformOwnerHeader } from '../../components/shell/PlatformOwnerHeader';
import { en } from '../../lib/i18n/messages/en';
import { ar } from '../../lib/i18n/messages/ar';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('Platform Owner monthly-quality entry point', () => {
  it.each([
    ['en', en],
    ['ar', ar],
  ] as const)(
    'links to the quality screen in %s',
    async (_locale, messages) => {
      await act(async () => {
        root.render(createElement(PlatformOwnerHeader, { messages }));
      });
      const trigger = [...host.querySelectorAll('button')].find(
        (button) => button.textContent === messages['nav.more'],
      );
      await act(async () => trigger?.click());
      const link = host.querySelector<HTMLAnchorElement>(
        'a[href="/workforce/quality"]',
      );
      expect(link?.textContent).toBe(messages['workforce.quality.title']);
    },
  );
});

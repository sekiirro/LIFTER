import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

const routerPush = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

import {
  DirectoryWorkspaceSelector,
  navigateDirectoryWorkspace,
} from '../../app/(app)/clients/DirectoryWorkspaceSelector';

const query = {
  search: 'Nadia',
  approvalState: 'approved' as const,
  subscriptionStatus: null,
  assignment: null,
  page: 3,
};
const selectedWorkspace = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const expectedHref = `/clients?workspace=${selectedWorkspace}&q=Nadia&approval=approved&page=3`;

describe('directory workspace selector', () => {
  it('navigates with the selected workspace and current directory query', () => {
    navigateDirectoryWorkspace({ push: routerPush }, selectedWorkspace, query);
    expect(routerPush).toHaveBeenCalledWith(expectedHref);
    routerPush.mockClear();
  });

  it('connects workspace changes to the staff router pattern', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const oldGlobals = new Map<string, PropertyDescriptor | undefined>();
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      Event: dom.window.Event,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    for (const [key, value] of Object.entries(globals)) {
      oldGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { configurable: true, value });
    }
    const host = dom.window.document.createElement('div');
    dom.window.document.body.append(host);
    const root = createRoot(host);

    try {
      await act(async () =>
        root.render(
          createElement(DirectoryWorkspaceSelector, {
            workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            workspaces: [
              { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Current' },
              { id: selectedWorkspace, name: 'Next' },
            ],
            query,
          }),
        ),
      );
      const select = host.querySelector('select')!;
      const setValue = Object.getOwnPropertyDescriptor(
        dom.window.HTMLSelectElement.prototype,
        'value',
      )?.set;
      await act(async () => {
        setValue?.call(select, selectedWorkspace);
        select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });

      expect(routerPush).toHaveBeenCalledWith(expectedHref);
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      for (const [key, descriptor] of oldGlobals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
      routerPush.mockClear();
    }
  });
});

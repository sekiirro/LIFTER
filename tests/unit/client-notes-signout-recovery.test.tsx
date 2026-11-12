import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../app/(app)/actions', () => ({ signOut: vi.fn() }));

import { SignOutForm } from '../../components/auth/SignOutForm';

describe('Client Notes session recovery on sign-out', () => {
  let dom: JSDOM | undefined;
  let root:
    { render: (node: unknown) => void; unmount: () => void } | undefined;
  let globals: Map<string, PropertyDescriptor | undefined> | undefined;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    dom?.window.close();
    for (const [key, descriptor] of globals ?? []) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom = undefined;
    root = undefined;
    globals = undefined;
  });

  it('clears only Client Notes pending-create records before sign-out', async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    });
    const storage = dom.window.sessionStorage;
    storage.setItem(
      'lifter-client-notes-pending-create:v1:workspace:client',
      'pending',
    );
    storage.setItem('unrelated-session-state', 'keep');
    const currentGlobals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      Event: dom.window.Event,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    globals = new Map(
      Object.keys(currentGlobals).map((key) => [
        key,
        Object.getOwnPropertyDescriptor(globalThis, key),
      ]),
    );
    for (const [key, value] of Object.entries(currentGlobals))
      Object.defineProperty(globalThis, key, { configurable: true, value });

    const { createRoot } = await import('react-dom/client');
    const host = dom.window.document.createElement('div');
    dom.window.document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root?.render(createElement(SignOutForm, { label: 'Sign out' })),
    );
    await act(async () => {
      host
        .querySelector('form')!
        .dispatchEvent(
          new dom!.window.Event('submit', { bubbles: true, cancelable: true }),
        );
    });

    expect(
      storage.getItem('lifter-client-notes-pending-create:v1:workspace:client'),
    ).toBeNull();
    expect(storage.getItem('unrelated-session-state')).toBe('keep');
  });
});

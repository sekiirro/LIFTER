import { act, createElement, type ReactNode } from 'react';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMessages } from '../../lib/i18n';

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('../../app/(app)/actions', () => ({ signOut: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { SignOutForm } from '../../components/auth/SignOutForm';
import { signOut } from '../../app/(app)/actions';

describe('Client Notes session recovery on sign-out', () => {
  let dom: JSDOM | undefined;
  let root:
    { render: (node: ReactNode) => void; unmount: () => void } | undefined;
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
    vi.clearAllMocks();
  });

  async function renderForm() {
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
      root?.render(
        createElement(SignOutForm, {
          label: 'Sign out',
          failureLabel: getMessages('en')['states.error.description'],
          pendingLabel: getMessages('en')['button.loading'],
        }),
      ),
    );
    return { storage, host };
  }

  it('clears only Client Notes pending-create records after confirmed sign-out', async () => {
    vi.mocked(signOut).mockImplementation(async () => {
      expect(
        dom!.window.sessionStorage.getItem(
          'lifter-client-notes-pending-create:v1:workspace:client',
        ),
      ).toBe('pending');
      return true;
    });
    const { storage, host } = await renderForm();
    await act(async () => {
      host
        .querySelector('form')!
        .dispatchEvent(
          new dom!.window.Event('submit', { bubbles: true, cancelable: true }),
        );
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(
      storage.getItem('lifter-client-notes-pending-create:v1:workspace:client'),
    ).toBeNull();
    expect(storage.getItem('unrelated-session-state')).toBe('keep');
    expect(router.replace).toHaveBeenCalledWith('/login');
  });

  it('preserves recovery and the current route when sign-out fails', async () => {
    let finish!: (result: boolean) => void;
    vi.mocked(signOut).mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    const { storage, host } = await renderForm();
    await act(async () => {
      host
        .querySelector('form')!
        .dispatchEvent(
          new dom!.window.Event('submit', { bubbles: true, cancelable: true }),
        );
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(host.querySelector('button')?.getAttribute('aria-busy')).toBe(
      'true',
    );
    expect(host.textContent).toContain(getMessages('en')['button.loading']);
    expect(host.textContent).not.toContain(
      getMessages('en')['states.error.description'],
    );
    await act(async () => finish(false));
    expect(
      storage.getItem('lifter-client-notes-pending-create:v1:workspace:client'),
    ).toBe('pending');
    expect(storage.getItem('unrelated-session-state')).toBe('keep');
    expect(router.replace).not.toHaveBeenCalled();
    expect(host.textContent).toContain(
      getMessages('en')['states.error.description'],
    );
    expect((host.querySelector('button') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

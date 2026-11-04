import { act, createElement, type ReactNode } from 'react';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignupForm } from '../../app/register/[token]/SignupForm';
import type { PhoneCountryOption } from '../../lib/client-accounts/phone';
import { signupResult } from '../../lib/client-accounts/results';

const phoneCountries: PhoneCountryOption[] = [
  { code: 'EG', name: 'Egypt', callingCode: '20' },
];

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}

describe('signup result focus', () => {
  let root:
    { render: (node: ReactNode) => void; unmount: () => void } | undefined;
  let host: HTMLDivElement | undefined;
  let dom: JSDOM | undefined;
  let previousGlobals: Map<string, PropertyDescriptor | undefined> | undefined;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    host?.remove();
    dom?.window.close();
    for (const [key, descriptor] of previousGlobals ?? []) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    root = undefined;
    host = undefined;
    dom = undefined;
    previousGlobals = undefined;
  });

  it('does not refocus a server result when identity validation state changes', async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    });
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      HTMLInputElement: dom.window.HTMLInputElement,
      FormData: dom.window.FormData,
      Event: dom.window.Event,
      Node: dom.window.Node,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    previousGlobals = new Map(
      Object.keys(globals).map((key) => [
        key,
        Object.getOwnPropertyDescriptor(globalThis, key),
      ]),
    );
    for (const [key, value] of Object.entries(globals))
      Object.defineProperty(globalThis, key, { configurable: true, value });
    const { createRoot } = await import('react-dom/client');
    const action = vi.fn(async () => signupResult('unavailable', 'en'));
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        createElement(SignupForm, {
          action,
          locale: 'en',
          phoneCountries,
        }),
      );
    });

    const form = host.querySelector('form')!;
    const name = host.querySelector<HTMLInputElement>('[name="name"]')!;
    const dateOfBirth = host.querySelector<HTMLInputElement>(
      '[name="dateOfBirth"]',
    )!;
    const username = host.querySelector<HTMLInputElement>('[name="username"]')!;
    await act(async () => {
      setInputValue(name, 'Heba Sami Nabil');
      setInputValue(dateOfBirth, '1990-10-30');
      setInputValue(username, 'heba_r18_focus');
    });

    await act(async () => {
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(action).toHaveBeenCalledOnce();
    const result = host.querySelector('[data-result-status="unavailable"]');
    expect(result).not.toBeNull();
    expect(document.activeElement).toBe(result);

    await act(async () => {
      name.focus();
      name.blur();
    });

    expect(document.activeElement).not.toBe(result);
  });

  it('does not refocus a server-reported field when identity validation state changes', async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    });
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      HTMLInputElement: dom.window.HTMLInputElement,
      FormData: dom.window.FormData,
      Event: dom.window.Event,
      Node: dom.window.Node,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    previousGlobals = new Map(
      Object.keys(globals).map((key) => [
        key,
        Object.getOwnPropertyDescriptor(globalThis, key),
      ]),
    );
    for (const [key, value] of Object.entries(globals))
      Object.defineProperty(globalThis, key, { configurable: true, value });
    const { createRoot } = await import('react-dom/client');
    const action = vi.fn(async () =>
      signupResult('invalid_input', 'en', ['email']),
    );
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        createElement(SignupForm, {
          action,
          locale: 'en',
          phoneCountries,
        }),
      );
    });

    const form = host.querySelector('form')!;
    const name = host.querySelector<HTMLInputElement>('[name="name"]')!;
    const dateOfBirth = host.querySelector<HTMLInputElement>(
      '[name="dateOfBirth"]',
    )!;
    const username = host.querySelector<HTMLInputElement>('[name="username"]')!;
    const email = host.querySelector<HTMLInputElement>('[name="email"]')!;
    await act(async () => {
      setInputValue(name, 'Heba Sami Nabil');
      setInputValue(dateOfBirth, '1990-10-30');
      setInputValue(username, 'heba_r18_server_focus');
    });

    await act(async () => {
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(action).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(email);

    await act(async () => {
      name.focus();
      name.blur();
    });

    expect(document.activeElement).not.toBe(email);
  });

  it('does not refocus an identity field after the user leaves the form', async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    });
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      HTMLInputElement: dom.window.HTMLInputElement,
      FormData: dom.window.FormData,
      Event: dom.window.Event,
      Node: dom.window.Node,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    previousGlobals = new Map(
      Object.keys(globals).map((key) => [
        key,
        Object.getOwnPropertyDescriptor(globalThis, key),
      ]),
    );
    for (const [key, value] of Object.entries(globals))
      Object.defineProperty(globalThis, key, { configurable: true, value });
    const { createRoot } = await import('react-dom/client');
    const action = vi.fn(async () => signupResult('unavailable', 'en'));
    host = document.createElement('div');
    document.body.append(host);
    const outsideButton = document.createElement('button');
    outsideButton.textContent = 'Outside form';
    document.body.append(outsideButton);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        createElement(SignupForm, {
          action,
          locale: 'en',
          phoneCountries,
        }),
      );
    });

    const form = host.querySelector('form')!;
    const name = host.querySelector<HTMLInputElement>('[name="name"]')!;
    await act(async () => {
      form.requestSubmit();
    });
    expect(action).not.toHaveBeenCalled();

    await act(async () => {
      outsideButton.focus();
      setInputValue(name, 'Heba Sami Nabil');
    });

    expect(document.activeElement).toBe(outsideButton);
    outsideButton.remove();
  });

  it('focuses Username when the server reports the unavailable status there', async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    });
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      HTMLInputElement: dom.window.HTMLInputElement,
      FormData: dom.window.FormData,
      Event: dom.window.Event,
      Node: dom.window.Node,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    previousGlobals = new Map(
      Object.keys(globals).map((key) => [
        key,
        Object.getOwnPropertyDescriptor(globalThis, key),
      ]),
    );
    for (const [key, value] of Object.entries(globals))
      Object.defineProperty(globalThis, key, { configurable: true, value });
    const { createRoot } = await import('react-dom/client');
    const action = vi.fn(async () =>
      signupResult('invalid_input', 'en', ['username']),
    );
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        createElement(SignupForm, {
          action,
          locale: 'en',
          phoneCountries,
        }),
      );
    });

    const form = host.querySelector('form')!;
    const name = host.querySelector<HTMLInputElement>('[name="name"]')!;
    const dateOfBirth = host.querySelector<HTMLInputElement>(
      '[name="dateOfBirth"]',
    )!;
    const username = host.querySelector<HTMLInputElement>('[name="username"]')!;
    await act(async () => {
      setInputValue(name, 'Heba Sami Nabil');
      setInputValue(dateOfBirth, '1990-10-30');
      setInputValue(username, 'heba_r20_focus');
    });

    await act(async () => {
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(action).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(username);
    expect(username.getAttribute('aria-invalid')).toBe('true');
    expect(username.getAttribute('aria-describedby')).toBe(
      'signup-username-error',
    );
    expect(host.querySelector('#signup-username-error')).not.toBeNull();
  });
});

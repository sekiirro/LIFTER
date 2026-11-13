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
    expect(host.querySelector('[role="alert"]')).toBeNull();

    await act(async () => {
      outsideButton.focus();
      setInputValue(name, 'Heba Sami Nabil');
      setInputValue(
        host!.querySelector<HTMLInputElement>('[name="dateOfBirth"]')!,
        '1990-10-30',
      );
      setInputValue(
        host!.querySelector<HTMLInputElement>('[name="username"]')!,
        'heba_r22_valid',
      );
    });

    expect(document.activeElement).toBe(outsideButton);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    outsideButton.remove();
  });

  it('reports hydration only after the client form mounts', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const action = vi.fn(async () => signupResult('unavailable', 'en'));
    expect(
      renderToStaticMarkup(
        createElement(SignupForm, { action, locale: 'en', phoneCountries }),
      ),
    ).toContain('data-hydrated="false"');

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
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        createElement(SignupForm, { action, locale: 'en', phoneCountries }),
      );
    });

    expect(host.querySelector('form')?.getAttribute('data-hydrated')).toBe(
      'true',
    );
  });

  it.each(['en', 'ar'] as const)(
    'focuses Username when the server reports the unavailable status there (%s)',
    async (locale) => {
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
        signupResult('invalid_input', locale, ['username']),
      );
      host = document.createElement('div');
      document.body.append(host);
      root = createRoot(host);

      await act(async () => {
        root?.render(
          createElement(SignupForm, {
            action,
            locale,
            phoneCountries,
          }),
        );
      });

      const form = host.querySelector('form')!;
      const name = host.querySelector<HTMLInputElement>('[name="name"]')!;
      const dateOfBirth = host.querySelector<HTMLInputElement>(
        '[name="dateOfBirth"]',
      )!;
      const username =
        host.querySelector<HTMLInputElement>('[name="username"]')!;
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
      const usernameError = host.querySelector('#signup-username-error');
      expect(usernameError).not.toBeNull();
      expect(usernameError?.textContent).toBe(
        locale === 'en'
          ? 'This username is unavailable. Choose another.'
          : 'اسم المستخدم ده غير متاح. اختار اسم تاني.',
      );
      expect(usernameError?.querySelector('bdi')?.getAttribute('dir')).toBe(
        'auto',
      );
    },
  );

  it('clears a server username error on edit without checking availability', async () => {
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
      setInputValue(username, 'valid_user');
    });
    await act(async () => {
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(action).toHaveBeenCalledOnce();
    expect(username.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('#signup-username-error')?.textContent).toBe(
      'This username is unavailable. Choose another.',
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'This username is unavailable. Choose another.',
    );

    await act(async () => setInputValue(username, 'ab'));

    expect(username.getAttribute('aria-invalid')).toBe('true');
    expect(username.getAttribute('aria-describedby')).toBe(
      'signup-username-error',
    );
    expect(host.querySelector('#signup-username-error')?.textContent).toBe(
      'Use 3–30 characters: English letters, numbers, periods, or underscores.',
    );
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(action).toHaveBeenCalledOnce();

    await act(async () => setInputValue(username, 'valid_user2'));

    expect(username.getAttribute('aria-invalid')).toBe('false');
    expect(username.getAttribute('aria-describedby')).toBeNull();
    expect(host.querySelector('#signup-username-error')).toBeNull();
    expect(action).toHaveBeenCalledOnce();

    await act(async () => {
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(action).toHaveBeenCalledTimes(2);
    expect(host.querySelector('#signup-username-error')?.textContent).toBe(
      'This username is unavailable. Choose another.',
    );
  });

  it('hides the previous username server error while a resubmission is pending', async () => {
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
    let callCount = 0;
    let finishResubmission:
      ((result: ReturnType<typeof signupResult>) => void) | undefined;
    const action = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1)
        return signupResult('invalid_input', 'en', ['username']);
      return await new Promise<ReturnType<typeof signupResult>>((resolve) => {
        finishResubmission = resolve;
      });
    });
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
      setInputValue(username, 'valid_user');
    });
    await act(async () => {
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host.querySelector('#signup-username-error')?.textContent).toBe(
      'This username is unavailable. Choose another.',
    );

    await act(async () => {
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(action).toHaveBeenCalledTimes(2);
    expect(host.querySelector('#signup-username-error')).toBeNull();
    expect(host.querySelector('[role="alert"]')).toBeNull();

    await act(async () => {
      finishResubmission?.(signupResult('complete', 'en'));
    });
    expect(host.querySelector('#signup-username-error')).toBeNull();
  });

  it.each(['dateOfBirth', 'telegramUsername'] as const)(
    'renders and focuses a server-reported %s error',
    async (field) => {
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
        signupResult('invalid_input', 'en', [field]),
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
      const username =
        host.querySelector<HTMLInputElement>('[name="username"]')!;
      const telegramUsername = host.querySelector<HTMLInputElement>(
        '[name="telegramUsername"]',
      )!;
      await act(async () => {
        setInputValue(name, 'Heba Sami Nabil');
        setInputValue(dateOfBirth, '1990-10-30');
        setInputValue(username, 'valid_user');
        if (field === 'telegramUsername')
          setInputValue(telegramUsername, 'valid_tg');
      });
      await act(async () => {
        form.requestSubmit();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const input = field === 'dateOfBirth' ? dateOfBirth : telegramUsername;
      const errorId =
        field === 'dateOfBirth'
          ? 'signup-date-of-birth-error'
          : 'signup-telegram-error';
      expect(action).toHaveBeenCalledOnce();
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe(errorId);
      expect(host.querySelector(`#${errorId}`)).not.toBeNull();
      expect(document.activeElement).toBe(input);
    },
  );

  it('clears a client-side name error on edit without waiting for blur', async () => {
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
    const action = vi.fn(async () => signupResult('complete', 'en'));
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
      setInputValue(name, 'Heba Sami');
      setInputValue(dateOfBirth, '1990-10-30');
      setInputValue(username, 'valid_user');
    });
    await act(async () => {
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(action).not.toHaveBeenCalled();
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('#signup-name-error')).not.toBeNull();

    await act(async () => setInputValue(name, 'Heba Sami Nabil'));

    expect(name.getAttribute('aria-invalid')).not.toBe('true');
    expect(name.getAttribute('aria-describedby')).toBeNull();
    expect(host.querySelector('#signup-name-error')).toBeNull();
  });

  it('moves focus to the pending status when the focused submit control is disabled', async () => {
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
    const action = vi.fn(
      () => new Promise<ReturnType<typeof signupResult>>(() => {}),
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
    const name = host.querySelector<HTMLInputElement>('[name="name"]')!;
    const dateOfBirth = host.querySelector<HTMLInputElement>(
      '[name="dateOfBirth"]',
    )!;
    const username = host.querySelector<HTMLInputElement>('[name="username"]')!;
    const submit = host.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    await act(async () => {
      setInputValue(name, 'Heba Sami Nabil');
      setInputValue(dateOfBirth, '1990-10-30');
      setInputValue(username, 'heba_pending_focus');
    });
    await act(async () => submit.focus());
    expect(document.activeElement).toBe(submit);

    await act(async () => {
      submit.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(action).toHaveBeenCalledOnce();
    expect(submit.disabled).toBe(true);
    expect(document.activeElement).toBe(
      host.querySelector('form p[role="status"]'),
    );
  });
});

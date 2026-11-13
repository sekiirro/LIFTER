import { act, createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMessages } from '../../lib/i18n';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../../app/(app)/clients/[clientId]/actions', () => ({
  createClientNoteAction: vi.fn(),
  deleteClientNoteAction: vi.fn(),
  loadClientNotesAction: vi.fn(),
  updateClientNoteAction: vi.fn(),
}));

import { ClientDetailsTabs } from '../../app/(app)/clients/[clientId]/ClientDetailsTabs';

describe('staff Client Details Notes route surface', () => {
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
    root = undefined;
    dom = undefined;
    globals = undefined;
  });

  it.each([
    ['en', 'ltr'],
    ['ar', 'rtl'],
  ] as const)(
    'renders only the functional Notes tab in %s',
    (locale, direction) => {
      const messages = getMessages(locale);
      const html = renderToStaticMarkup(
        createElement(ClientDetailsTabs, {
          clientId: 'd29e1c04-2ddb-49fd-9a51-161cf35bca89',
          workspaceId: 'a49e1c04-2ddb-49fd-9a51-161cf35bca89',
          actorId: 'staff-user',
          role: 'trainer',
          locale,
          messages,
          notes: [],
          hasMore: false,
          status: 'ready',
        }),
      );

      expect(html).toContain(`dir="${direction}"`);
      expect(html).toContain('role="tablist"');
      expect(html).toContain('role="tab"');
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('role="tabpanel"');
      expect(html).toContain(messages['clientNotes.tab']);
      expect(html).toContain(messages['clientNotes.empty']);
      expect((html.match(/role="tab"/g) ?? []).length).toBe(1);
      const tabMarkup = html.match(
        /<button[^>]*role="tab"[^>]*>(.*?)<\/button>/,
      )?.[1];
      expect(tabMarkup).toBe(messages['clientNotes.tab']);
      expect(html).not.toMatch(/Overview|Exercise|Nutrition|History/i);
    },
  );

  it('remounts Client Notes and clears actor-scoped recovery when the actor changes', async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    });
    const currentGlobals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
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
    const props = {
      clientId: 'client-1',
      workspaceId: 'workspace-1',
      actorId: 'staff-a',
      role: 'trainer',
      locale: 'en' as const,
      messages: getMessages('en'),
      notes: [],
      hasMore: false,
      status: 'ready' as const,
    };
    await act(async () =>
      root?.render(createElement(ClientDetailsTabs, props)),
    );
    const textarea = host.querySelector('textarea')!;
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    await act(async () => {
      setter?.call(textarea, 'actor A pending note');
      textarea.dispatchEvent(new dom!.window.Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(
      (host.querySelector('textarea') as HTMLTextAreaElement).readOnly,
    ).toBe(true);

    await act(async () =>
      root?.render(
        createElement(ClientDetailsTabs, { ...props, actorId: 'staff-b' }),
      ),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      '',
    );
    expect(
      (host.querySelector('textarea') as HTMLTextAreaElement).readOnly,
    ).toBe(false);
    expect(host.textContent).not.toContain('actor A pending note');
    expect(host.textContent).not.toContain(
      getMessages('en')['clientNotes.retry'],
    );
  });
});

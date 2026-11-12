import { act, createElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientNotes } from '../../components/client-notes/ClientNotes';
import { getMessages } from '../../lib/i18n';

describe('ClientNotes UI', () => {
  it('matches every approved Client Notes copy row in both locales byte-for-byte', () => {
    const spec = readFileSync(
      new URL('../../specs/020-client-notes/spec.md', import.meta.url),
      'utf8',
    );
    const copyRows = new Map<number, { en: string; ar: string }>();
    for (const line of spec.split(/\r?\n/)) {
      const match = line.match(/^\|\s*(\d+)\s*\|/);
      if (!match) continue;
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      if (
        cells.length === 4 &&
        cells[2] !== undefined &&
        cells[3] !== undefined
      ) {
        copyRows.set(Number(match[1]), { en: cells[2], ar: cells[3] });
      }
    }

    const keys = [
      'clientNotes.tab',
      'clientNotes.create',
      'clientNotes.noteLabel',
      'clientNotes.charCounter',
      'clientNotes.saveNote',
      'clientNotes.cancel',
      'clientNotes.saving',
      'clientNotes.edit',
      'clientNotes.saveChanges',
      'clientNotes.delete',
      'clientNotes.deleteDialogTitle',
      'clientNotes.deleteDialogBody',
      'clientNotes.deleteDialogConfirm',
      'clientNotes.loading',
      'clientNotes.empty',
      'clientNotes.loadError',
      'clientNotes.retry',
      'clientNotes.saveError',
      'clientNotes.deleteError',
      'clientNotes.blankError',
      'clientNotes.tooLongError',
      'clientNotes.createdToast',
      'clientNotes.editedToast',
      'clientNotes.deletedToast',
      'clientNotes.editedMarker',
      'clientNotes.unavailableAuthor',
      'clientNotes.permissionRefused',
      'clientNotes.byline',
      'clientNotes.timestamp',
      'clientNotes.exitWarning.title',
      'clientNotes.exitWarning.body',
      'clientNotes.exitWarning.stay',
      'clientNotes.exitWarning.discard',
      'clientNotes.exitWarning.bodyInFlight',
      'clientNotes.loadMore',
    ] as const;

    expect(copyRows.size).toBeGreaterThanOrEqual(keys.length);
    keys.forEach((key, index) => {
      const approved = copyRows.get(index + 1);
      if (!approved) throw new Error(`Missing approved copy row ${index + 1}`);
      expect(getMessages('en')[key]).toBe(approved.en);
      expect(getMessages('ar')[key]).toBe(approved.ar);
    });
  });

  it('renders approved copy in EN', () => {
    const m = getMessages('en');
    const html = renderToStaticMarkup(
      createElement(ClientNotes, {
        locale: 'en',
        messages: m,
        status: 'ready',
        notes: [],
      }),
    );
    expect(html).toContain(m['clientNotes.tab']);
    expect(html).toContain(m['clientNotes.empty']);
    expect(html).toContain(m['clientNotes.create']);
    expect(html).not.toContain('Save Draft');
  });

  it('uses the approved unavailable-author label instead of rendering an author identifier', async () => {
    const note = {
      id: 'n-author',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: '30000000-0000-4000-8000-000000000099',
      body: 'private note',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    const html = renderToStaticMarkup(
      createElement(ClientNotes, {
        locale: 'en',
        messages: mEn,
        status: 'ready',
        notes: [note],
      }),
    );
    expect(html).toContain(mEn['clientNotes.unavailableAuthor']);
    expect(html).not.toContain(note.author_user_id);
  });

  it('renders approved copy in AR with rtl', () => {
    const m = getMessages('ar');
    const html = renderToStaticMarkup(
      createElement(ClientNotes, {
        locale: 'ar',
        messages: m,
        status: 'ready',
        notes: [],
      }),
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain(m['clientNotes.tab']);
    expect(html).toContain(m['clientNotes.empty']);
  });

  it('renders unavailable-author copy and Western digits in Arabic', async () => {
    const messages = getMessages('ar');
    const note = {
      id: 'n-ar',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: '',
      body: 'Arabic locale metadata',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    const html = renderToStaticMarkup(
      createElement(ClientNotes, {
        locale: 'ar',
        messages,
        status: 'ready',
        notes: [note],
        role: 'trainer',
        actorId: 'current-user',
      }),
    );
    expect(html).toContain(messages['clientNotes.unavailableAuthor']);
    expect(html).toMatch(/[0-9]/);
    expect(html).not.toMatch(/[٠-٩]/);
  });

  it('renders loading state', () => {
    const m = getMessages('en');
    const html = renderToStaticMarkup(
      createElement(ClientNotes, {
        locale: 'en',
        messages: m,
        status: 'loading',
      }),
    );
    expect(html).toContain(m['clientNotes.loading']);
  });

  it('renders error state with retry', () => {
    const m = getMessages('en');
    const html = renderToStaticMarkup(
      createElement(ClientNotes, {
        locale: 'en',
        messages: m,
        status: 'error',
      }),
    );
    expect(html).toContain(m['clientNotes.loadError']);
    expect(html).toContain(m['clientNotes.retry']);
  });

  it('shows delete only for platform_owner', () => {
    const m = getMessages('en');
    const note = {
      id: 'n1',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'hello',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    const htmlOwner = renderToStaticMarkup(
      createElement(ClientNotes, {
        locale: 'en',
        messages: m,
        status: 'ready',
        notes: [note],
        role: 'platform_owner',
        actorId: 'po',
      }),
    );
    expect(htmlOwner).toContain(m['clientNotes.delete']);
    const htmlTrainer = renderToStaticMarkup(
      createElement(ClientNotes, {
        locale: 'en',
        messages: m,
        status: 'ready',
        notes: [note],
        role: 'trainer',
        actorId: 'u2',
      }),
    );
    expect(htmlTrainer).not.toContain(m['clientNotes.delete']);
  });

  it('shows edit for author or platform_owner', () => {
    const m = getMessages('en');
    const note = {
      id: 'n1',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'hello',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    const htmlAuthor = renderToStaticMarkup(
      createElement(ClientNotes, {
        locale: 'en',
        messages: m,
        status: 'ready',
        notes: [note],
        role: 'trainer',
        actorId: 'u1',
      }),
    );
    expect(htmlAuthor).toContain(m['clientNotes.edit']);
    const htmlOther = renderToStaticMarkup(
      createElement(ClientNotes, {
        locale: 'en',
        messages: m,
        status: 'ready',
        notes: [note],
        role: 'trainer',
        actorId: 'u2',
      }),
    );
    expect(htmlOther).not.toContain(m['clientNotes.edit']);
  });

  it('wraps mixed-direction text in Bidi', () => {
    const m = getMessages('en');
    const note = {
      id: 'n1',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'Hello 123',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    const html = renderToStaticMarkup(
      createElement(ClientNotes, {
        locale: 'en',
        messages: m,
        status: 'ready',
        notes: [note],
        role: 'trainer',
        actorId: 'u1',
      }),
    );
    expect(html).toContain('<bdi');
    expect(html).toContain('Hello 123');
  });

  it('has no Save Draft control', () => {
    const m = getMessages('en');
    const html = renderToStaticMarkup(
      createElement(ClientNotes, {
        locale: 'en',
        messages: m,
        status: 'ready',
        notes: [],
      }),
    );
    expect(html.toLowerCase()).not.toContain('save draft');
  });

  it('exit-warning in-flight body is approved row 34', () => {
    const m = getMessages('en');
    expect(m['clientNotes.exitWarning.bodyInFlight']).toBe(
      "Your note is being saved. Leaving now won't cancel the save.",
    );
    const ar = getMessages('ar');
    expect(ar['clientNotes.exitWarning.bodyInFlight']).toBe(
      'ملاحظتك بتتحفظ. لو خرجت دلوقتي، الحفظ مش هيتلغي.',
    );
  });
});

const mEn = getMessages('en');

function setValue(
  element: HTMLTextAreaElement | HTMLInputElement,
  value: string,
) {
  const setter = Object.getOwnPropertyDescriptor(
    (element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement
      : window.HTMLInputElement
    ).prototype,
    'value',
  )?.set;
  setter?.call(element, value);
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
}

describe('ClientNotes behaviour', () => {
  let dom: JSDOM | undefined;
  let host: HTMLDivElement | undefined;
  let root:
    { render: (node: ReactNode) => void; unmount: () => void } | undefined;
  let previousGlobals: Map<string, PropertyDescriptor | undefined> | undefined;

  it('loads and appends the next note page, then hides load more at the terminal page', async () => {
    const note = (id: string, body: string) => ({
      id,
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body,
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    });
    const onLoadMore = vi.fn(async () => ({
      status: 'ok',
      notes: [note('n2', 'second page')],
      hasMore: false,
    }));
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [note('n1', 'first page')],
      hasMore: true,
      onLoadMore,
    });
    const button = () =>
      Array.from(host!.querySelectorAll('button')).find(
        (item) => item.textContent === mEn['clientNotes.loadMore'],
      );
    await act(async () => {
      button()!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onLoadMore).toHaveBeenCalledWith({
      created_at: '2026-11-08T10:15:00Z',
      id: 'n1',
    });
    expect(host!.textContent).toContain('first page');
    expect(host!.textContent).toContain('second page');
    expect(button()).toBeUndefined();
  });

  it('uses approved load-error and Retry copy without exposing a server error', async () => {
    const note = {
      id: 'n1',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'first page',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    const onLoadMore = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'unavailable',
        error: 'private database diagnostic',
      })
      .mockResolvedValueOnce({ status: 'ok', notes: [], hasMore: false });
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [note],
      hasMore: true,
      onLoadMore,
    });
    const loadMore = () =>
      Array.from(host!.querySelectorAll('button')).find(
        (button) => button.textContent === mEn['clientNotes.loadMore'],
      )!;
    await act(async () => {
      loadMore().click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host!.textContent).toContain(mEn['clientNotes.loadError']);
    expect(host!.textContent).toContain(mEn['clientNotes.retry']);
    expect(host!.textContent).not.toContain('private database diagnostic');
    const retry = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.retry'],
    )!;
    await act(async () => {
      retry.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onLoadMore).toHaveBeenCalledTimes(2);
    expect(host!.textContent).not.toContain(mEn['clientNotes.loadError']);
  });

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

  async function render(
    props: Record<string, unknown>,
    options: {
      windowName?: string;
      session?: Record<string, string>;
      storageUnavailable?: boolean;
    } = {},
  ) {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    });
    if (options.windowName) dom.window.name = options.windowName;
    for (const [key, value] of Object.entries(options.session ?? {}))
      dom.window.sessionStorage.setItem(key, value);
    if (options.storageUnavailable)
      Object.defineProperty(dom.window, 'sessionStorage', {
        configurable: true,
        get() {
          throw new Error('session storage unavailable');
        },
      });
    dom.window.HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    dom.window.HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
      HTMLInputElement: dom.window.HTMLInputElement,
      Event: dom.window.Event,
      Node: dom.window.Node,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    if (!previousGlobals) {
      previousGlobals = new Map(
        Object.keys(globals).map((key) => [
          key,
          Object.getOwnPropertyDescriptor(globalThis, key),
        ]),
      );
    }
    for (const [key, value] of Object.entries(globals))
      Object.defineProperty(globalThis, key, { configurable: true, value });
    const { createRoot } = await import('react-dom/client');
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(ClientNotes, props as never));
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    return { dom, host: host!, root: root! };
  }

  it('create: first submit generates a key', async () => {
    const onSuccess = vi.fn();
    const onCreate = vi.fn<
      (b: string, k: string) => Promise<{ status: string }>
    >(async () => ({ status: 'ok' }));
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate,
      onSuccess,
      canCreate: true,
    });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'hello'));
    const submit = host!.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    await act(async () => {
      submit.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![0]).toBe('hello');
    expect(typeof onCreate.mock.calls[0]![1]).toBe('string');
    expect(onSuccess).toHaveBeenCalledWith('created');
  });

  it('create: retry after failed result re-sends same key and body', async () => {
    let requests = 0;
    const onCreate = vi.fn<
      (b: string, k: string) => Promise<{ status: string; error?: string }>
    >(async () => {
      requests += 1;
      return requests === 1
        ? { status: 'unavailable', error: 'boom' }
        : { status: 'denied', error: 'refused' };
    });
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate,
      canCreate: true,
      actorId: 'actor-1',
      clientId: 'client-1',
      workspaceId: 'workspace-1',
    });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'hello'));
    const submit = host!.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    await act(async () => {
      submit.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      submit.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onCreate).toHaveBeenCalledTimes(2);
    expect(onCreate.mock.calls[1]![1]).toBe(onCreate.mock.calls[0]![1]);
    expect(onCreate.mock.calls[1]![0]).toBe('hello');
    expect(host!.textContent).toContain(mEn['clientNotes.saveError']);
    expect(host!.textContent).not.toContain('boom');
    const stored = JSON.parse(
      dom!.window.sessionStorage.getItem(
        'lifter-client-notes-pending-create:v1:workspace-1:client-1',
      )!,
    ) as { body: string; idempotencyKey: string; retrySent: boolean };
    expect(stored).toMatchObject({
      body: 'hello',
      idempotencyKey: onCreate.mock.calls[0]![1],
      retrySent: true,
    });
  });

  it('clears create recovery after a definite not-found result before Retry', async () => {
    const onCreate = vi.fn(async () => ({ status: 'not_found' }));
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate,
      canCreate: true,
      actorId: 'actor-1',
      clientId: 'client-1',
      workspaceId: 'workspace-1',
    });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'deleted outcome'));
    await act(async () => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(
      dom!.window.sessionStorage.getItem(
        'lifter-client-notes-pending-create:v1:workspace-1:client-1',
      ),
    ).toBeNull();
    expect(
      (host!.querySelector('textarea') as HTMLTextAreaElement).readOnly,
    ).toBe(false);
  });

  it('resolves a deleted create after an unknown-result Retry returns not-found', async () => {
    let attempts = 0;
    const bodies: string[] = [];
    const keys: string[] = [];
    const onCreate = vi.fn(async (body: string, key: string) => {
      attempts += 1;
      bodies.push(body);
      keys.push(key);
      return attempts === 1
        ? { status: 'unavailable' }
        : { status: 'not_found' };
    });
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate,
      canCreate: true,
      actorId: 'actor-1',
      clientId: 'client-1',
      workspaceId: 'workspace-1',
    });
    const storageKey =
      'lifter-client-notes-pending-create:v1:workspace-1:client-1';
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'retried note'),
    );
    await act(async () => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const originalKey = onCreate.mock.calls[0]![1];
    await act(async () => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onCreate.mock.calls[1]).toEqual(['retried note', originalKey]);
    expect(bodies).toEqual(['retried note', 'retried note']);
    expect(keys[1]).toBe(keys[0]);
    expect(dom!.window.sessionStorage.getItem(storageKey)).toBeNull();
    expect(
      (host!.querySelector('textarea') as HTMLTextAreaElement).readOnly,
    ).toBe(false);
  });

  it('uses the approved permission-refusal copy for definite denied mutations', async () => {
    const note = {
      id: 'n-denied',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'owner',
      body: 'approved denial copy',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    const onCreate = vi.fn(async () => ({ status: 'denied' }));
    const onUpdate = vi.fn(async () => ({ status: 'denied' }));
    const onDelete = vi.fn(async () => ({ status: 'denied' }));
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [note],
      actorId: 'owner',
      role: 'platform_owner',
      canCreate: true,
      onCreate,
      onUpdate,
      onDelete,
    });

    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'denied create'),
    );
    await act(async () => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host!.textContent).toContain(mEn['clientNotes.permissionRefused']);

    const byText = (text: string) =>
      Array.from(host!.querySelectorAll('button')).find(
        (button) => button.textContent === text,
      )!;
    await act(async () => byText(mEn['clientNotes.edit']).click());
    await act(async () => {
      byText(mEn['clientNotes.saveChanges']).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host!.textContent).toContain(mEn['clientNotes.permissionRefused']);

    await act(async () => byText(mEn['clientNotes.cancel']).click());
    await act(async () => byText(mEn['clientNotes.delete']).click());
    await act(async () => {
      byText(mEn['clientNotes.deleteDialogConfirm']).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host!.textContent).toContain(mEn['clientNotes.permissionRefused']);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('does not let a delayed definite refusal erase a newer recovery record', async () => {
    let resolveOriginal: ((result: { status: string }) => void) | undefined;
    const originalCreate = vi.fn(
      () =>
        new Promise<{ status: string }>((resolve) => {
          resolveOriginal = resolve;
        }),
    );
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate: originalCreate,
      canCreate: true,
      actorId: 'actor-1',
      clientId: 'client-1',
      workspaceId: 'workspace-1',
    });
    await act(async () => setValue(host!.querySelector('textarea')!, 'first'));
    await act(async () => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const storageKey =
      'lifter-client-notes-pending-create:v1:workspace-1:client-1';
    const originalKey = JSON.parse(
      dom!.window.sessionStorage.getItem(storageKey)!,
    ).idempotencyKey as string;

    const secondHost = dom!.window.document.createElement('div');
    dom!.window.document.body.append(secondHost);
    const { createRoot } = await import('react-dom/client');
    const secondRoot = createRoot(secondHost);
    const retryCreate = vi.fn(async (_body: string, key: string) =>
      key === originalKey ? { status: 'ok' } : { status: 'unavailable' },
    );
    await act(async () => {
      secondRoot.render(
        createElement(ClientNotes, {
          locale: 'en',
          messages: mEn,
          status: 'ready',
          notes: [],
          onCreate: retryCreate,
          canCreate: true,
          actorId: 'actor-1',
          clientId: 'client-1',
          workspaceId: 'workspace-1',
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const retryButton = Array.from(secondHost.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.retry'],
    )!;
    await act(async () => {
      retryButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () =>
      setValue(secondHost.querySelector('textarea')!, 'second'),
    );
    await act(async () => {
      secondHost
        .querySelector<HTMLButtonElement>('button[type="submit"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const newerRecord = JSON.parse(
      dom!.window.sessionStorage.getItem(storageKey)!,
    ) as { body: string; idempotencyKey: string };
    expect(newerRecord).toMatchObject({ body: 'second' });
    expect(newerRecord.idempotencyKey).not.toBe(originalKey);

    await act(async () => {
      resolveOriginal?.({ status: 'denied' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(JSON.parse(dom!.window.sessionStorage.getItem(storageKey)!)).toEqual(
      newerRecord,
    );
    await act(async () => secondRoot.unmount());
    secondHost.remove();
  });

  it('keeps unresolved create recovery after the unknown-result exit discard', async () => {
    const onCreate = vi.fn(async () => ({ status: 'unavailable' }));
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate,
      canCreate: true,
      actorId: 'actor-1',
      clientId: 'client-1',
      workspaceId: 'workspace-1',
    });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'unknown result'));
    await act(async () => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const recoveryKey =
      'lifter-client-notes-pending-create:v1:workspace-1:client-1';
    const originalRecord = dom!.window.sessionStorage.getItem(recoveryKey);
    expect(originalRecord).not.toBeNull();

    const cancel = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.cancel'],
    )!;
    await act(async () => cancel.click());
    const dialog = host!.querySelector('dialog')!;
    expect(dialog.textContent).toContain(mEn['clientNotes.exitWarning.title']);
    expect(dialog.textContent).toContain(mEn['clientNotes.saveError']);
    expect(dialog.textContent).not.toContain(
      mEn['clientNotes.exitWarning.bodyInFlight'],
    );
    const discard = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.exitWarning.discard'],
    )!;
    await act(async () => discard.click());
    expect(host!.querySelector('dialog')).toBeNull();
    expect(host!.querySelector('form')).toBeNull();
    expect(host!.textContent).toContain(mEn['clientNotes.retry']);
    expect(dom!.window.sessionStorage.getItem(recoveryKey)).toBe(
      originalRecord,
    );
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('create: persists before dispatch and clears the unresolved record after Retry succeeds', async () => {
    let calls = 0;
    const onCreate = vi.fn(async (body: string, key: string) => {
      calls += 1;
      const stored = JSON.parse(
        dom!.window.sessionStorage.getItem(
          'lifter-client-notes-pending-create:v1:workspace-1:client-1',
        )!,
      ) as { body: string; idempotencyKey: string; retrySent: boolean };
      expect(stored).toMatchObject({
        body,
        idempotencyKey: key,
        retrySent: calls > 1,
      });
      return calls === 1 ? { status: 'unavailable' } : { status: 'ok' };
    });
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate,
      canCreate: true,
      actorId: 'actor-1',
      clientId: 'client-1',
      workspaceId: 'workspace-1',
    });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'retained body'));
    const submit = host!.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    await act(async () => {
      submit.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(textarea.readOnly).toBe(true);
    expect(submit.textContent).toBe(mEn['clientNotes.retry']);
    const key = onCreate.mock.calls[0]![1];
    await act(async () => {
      submit.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onCreate).toHaveBeenCalledTimes(2);
    expect(onCreate.mock.calls[1]![0]).toBe('retained body');
    expect(onCreate.mock.calls[1]![1]).toBe(key);
    expect(
      dom!.window.sessionStorage.getItem(
        'lifter-client-notes-pending-create:v1:workspace-1:client-1',
      ),
    ).toBeNull();
  });

  it('create: restores same-tab state but discards opener-copied records', async () => {
    const key = 'lifter-client-notes-pending-create:v1:workspace-1:client-1';
    const record = {
      tabId: 'tab-1',
      actorId: 'actor-1',
      clientId: 'client-1',
      workspaceId: 'workspace-1',
      text: 'restored text',
      body: 'restored text',
      idempotencyKey: 'key-1',
      retrySent: true,
    };
    const sameTab = await render(
      {
        locale: 'en',
        messages: mEn,
        status: 'ready',
        notes: [],
        onCreate: vi.fn(async () => ({ status: 'ok' })),
        canCreate: true,
        actorId: 'actor-1',
        clientId: 'client-1',
        workspaceId: 'workspace-1',
      },
      {
        windowName: 'lifter-client-notes-tab:v1:tab-1',
        session: { [key]: JSON.stringify(record) },
      },
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(
      (sameTab.host.querySelector('textarea') as HTMLTextAreaElement).value,
    ).toBe('restored text');
    expect(
      (sameTab.host.querySelector('textarea') as HTMLTextAreaElement).readOnly,
    ).toBe(true);
    await act(async () => sameTab.root.unmount());
    sameTab.host.remove();
    sameTab.dom.window.close();
    root = undefined;
    host = undefined;
    dom = undefined;
    const copied = await render(
      {
        locale: 'en',
        messages: mEn,
        status: 'ready',
        notes: [],
        onCreate: vi.fn(async () => ({ status: 'ok' })),
        canCreate: true,
        actorId: 'actor-1',
        clientId: 'client-1',
        workspaceId: 'workspace-1',
      },
      {
        windowName: 'lifter-client-notes-tab:v1:tab-2',
        session: { [key]: JSON.stringify(record) },
      },
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(
      (copied.host.querySelector('textarea') as HTMLTextAreaElement).value,
    ).toBe('');
    expect(copied.dom.window.sessionStorage.getItem(key)).toBeNull();
  });

  it('starts a new tab without a pending create record', async () => {
    const key = 'lifter-client-notes-pending-create:v1:workspace-1:client-1';
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate: vi.fn(async () => ({ status: 'ok' })),
      canCreate: true,
      actorId: 'actor-1',
      clientId: 'client-1',
      workspaceId: 'workspace-1',
    });
    expect((host!.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      '',
    );
    expect(host!.textContent).not.toContain(mEn['clientNotes.retry']);
    expect(dom!.window.sessionStorage.getItem(key)).toBeNull();
  });

  it('clears a prior actor recovery record when the signed-in actor changes', async () => {
    const storageKey =
      'lifter-client-notes-pending-create:v1:workspace-1:client-1';
    await render(
      {
        locale: 'en',
        messages: mEn,
        status: 'ready',
        notes: [],
        actorId: 'actor-2',
        clientId: 'client-1',
        workspaceId: 'workspace-1',
      },
      {
        windowName: 'lifter-client-notes-tab:v1:different-tab',
        session: {
          [storageKey]: JSON.stringify({
            tabId: 'different-tab',
            actorId: 'actor-1',
            clientId: 'client-1',
            workspaceId: 'workspace-1',
            text: 'private note text',
            body: 'private note text',
            idempotencyKey: 'old-key',
            retrySent: false,
          }),
        },
      },
    );
    expect(dom!.window.sessionStorage.getItem(storageKey)).toBeNull();
    expect(host!.textContent).not.toContain('private note text');
  });

  it('create: proceeds when writing the pre-dispatch recovery record fails', async () => {
    const onCreate = vi.fn(async () => ({ status: 'unavailable' }));
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate,
      canCreate: true,
      actorId: 'actor-1',
      clientId: 'client-1',
      workspaceId: 'workspace-1',
    });
    const storage = vi
      .spyOn(dom!.window.Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'memory only'));
    await act(async () => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(host!.textContent).toContain(mEn['clientNotes.saveError']);
    storage.mockRestore();
  });

  it('keeps create recovery in page memory when sessionStorage is unavailable', async () => {
    const onCreate = vi.fn(async () => ({ status: 'unavailable' }));
    await render(
      {
        locale: 'en',
        messages: mEn,
        status: 'ready',
        notes: [],
        onCreate,
        canCreate: true,
        actorId: 'actor-1',
        clientId: 'client-1',
        workspaceId: 'workspace-1',
      },
      { storageUnavailable: true },
    );
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'memory-only recovery'));
    await act(async () => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect((host!.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      'memory-only recovery',
    );
    expect(
      (host!.querySelector('textarea') as HTMLTextAreaElement).readOnly,
    ).toBe(true);
    expect(host!.textContent).toContain(mEn['clientNotes.saveError']);
  });

  it('create: after success a new key is used', async () => {
    const onCreate = vi.fn<
      (b: string, k: string) => Promise<{ status: string }>
    >(async () => ({ status: 'ok' }));
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate,
      canCreate: true,
    });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'first'));
    const submit = host!.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    await act(async () => {
      submit.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const firstKey = onCreate.mock.calls[0]![1];
    await act(async () => setValue(textarea, 'second'));
    await act(async () => {
      submit.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onCreate).toHaveBeenCalledTimes(2);
    expect(onCreate.mock.calls[1]![1]).not.toBe(firstKey);
  });

  it('create: after editing text a new key is used', async () => {
    const onCreate = vi.fn<
      (b: string, k: string) => Promise<{ status: string; error?: string }>
    >(async () => ({ status: 'denied', error: 'boom' }));
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate,
      canCreate: true,
    });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'hello'));
    const submit = host!.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    await act(async () => {
      submit.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const firstKey = onCreate.mock.calls[0]![1];
    await act(async () => setValue(textarea, 'hello edited'));
    await act(async () => {
      submit.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onCreate).toHaveBeenCalledTimes(2);
    expect(onCreate.mock.calls[1]![1]).not.toBe(firstKey);
  });

  it('exit protection: unsaved text opens warning; Stay keeps text; Discard clears and closes', async () => {
    const onCreate = vi.fn();
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate,
      canCreate: true,
    });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'unsaved'));
    const cancel = Array.from(host!.querySelectorAll('button')).find(
      (b) => b.textContent === mEn['clientNotes.cancel'],
    )!;
    await act(async () => cancel.click());
    expect(host!.textContent).toContain(mEn['clientNotes.exitWarning.title']);
    expect(host!.textContent).toContain(mEn['clientNotes.exitWarning.body']);
    const stay = Array.from(host!.querySelectorAll('button')).find(
      (b) => b.textContent === mEn['clientNotes.exitWarning.stay'],
    )!;
    await act(async () => stay.click());
    expect(host!.querySelector('[role="dialog"]')).toBeNull();
    expect((host!.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      'unsaved',
    );
    await act(async () => cancel.click());
    const discard = Array.from(host!.querySelectorAll('button')).find(
      (b) => b.textContent === mEn['clientNotes.exitWarning.discard'],
    )!;
    await act(async () => discard.click());
    expect(host!.querySelector('[role="dialog"]')).toBeNull();
    expect(
      (host!.querySelector('textarea') as HTMLTextAreaElement)?.value ?? '',
    ).toBe('');
    expect(onCreate).not.toHaveBeenCalled();
    expect(host!.textContent?.toLowerCase()).not.toContain('save draft');
    expect(host!.querySelector('form')).toBeNull();
    const reopen = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.create'],
    );
    expect(reopen).toBeDefined();
    await act(async () => reopen!.click());
    expect(host!.querySelector('form')).not.toBeNull();
  });

  it('uses the browser beforeunload warning only for unresolved text', async () => {
    await render({ locale: 'en', messages: mEn, status: 'ready', notes: [] });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'unsaved note'));
    const event = new dom!.window.Event('beforeunload', {
      cancelable: true,
    });
    dom!.window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not warn when cancelling an unchanged edit', async () => {
    const note = {
      id: 'n1',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'unchanged',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [note],
      role: 'trainer',
      actorId: 'u1',
    });
    await act(async () => {
      Array.from(host!.querySelectorAll('button'))
        .find((button) => button.textContent === mEn['clientNotes.edit'])!
        .click();
    });
    await act(async () => {
      Array.from(host!.querySelectorAll('button'))
        .find((button) => button.textContent === mEn['clientNotes.cancel'])!
        .click();
    });
    expect(host!.querySelector('dialog')).toBeNull();
    expect(host!.querySelectorAll('textarea')).toHaveLength(1);
  });

  it('renders the approved unsaved-exit copy in Arabic', async () => {
    const messages = getMessages('ar');
    await render({
      locale: 'ar',
      messages,
      status: 'ready',
      notes: [],
      canCreate: true,
      onCreate: vi.fn(),
    });
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'draft text'),
    );
    const cancel = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === messages['clientNotes.cancel'],
    )!;
    await act(async () => cancel.click());
    const dialog = host!.querySelector('dialog')!;
    for (const key of [
      'clientNotes.exitWarning.title',
      'clientNotes.exitWarning.body',
      'clientNotes.exitWarning.stay',
      'clientNotes.exitWarning.discard',
    ] as const) {
      expect(dialog.textContent).toContain(messages[key]);
    }
  });

  it('exit protection: in-flight leaving shows row 34 body; Discard leaves without cancelling save', async () => {
    let resolveCreate:
      ((v: { status: string; error?: string }) => void) | undefined;
    const onCreate = vi.fn<
      (b: string, k: string) => Promise<{ status: string; error?: string }>
    >(
      () =>
        new Promise<{ status: string; error?: string }>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate,
      canCreate: true,
    });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'inflight'));
    const submit = host!.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    await act(async () => {
      submit.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const cancel = Array.from(host!.querySelectorAll('button')).find(
      (b) => b.textContent === mEn['clientNotes.cancel'],
    )!;
    await act(async () => cancel.click());
    expect(host!.textContent).toContain(
      mEn['clientNotes.exitWarning.bodyInFlight'],
    );
    const discard = Array.from(host!.querySelectorAll('button')).find(
      (b) => b.textContent === mEn['clientNotes.exitWarning.discard'],
    )!;
    await act(async () => discard.click());
    expect(host!.querySelector('[role="dialog"]')).toBeNull();
    expect(onCreate).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveCreate?.({ status: 'error', error: 'boom' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host!.textContent).toContain(mEn['clientNotes.saveError']);
    expect(host!.textContent).not.toContain('boom');
  });

  it('keeps the create editor closed when an in-flight create succeeds after Discard', async () => {
    let resolveCreate: ((v: { status: string }) => void) | undefined;
    const onCreate = vi.fn<
      (b: string, k: string) => Promise<{ status: string }>
    >(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate,
      canCreate: true,
    });
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'submitted'),
    );
    await act(async () => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const cancel = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.cancel'],
    )!;
    await act(async () => cancel.click());
    const discard = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.exitWarning.discard'],
    )!;
    await act(async () => discard.click());
    expect(host!.querySelector('textarea')).toBeNull();

    await act(async () => resolveCreate?.({ status: 'ok' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(host!.querySelector('textarea')).toBeNull();
    expect(
      Array.from(host!.querySelectorAll('button')).some(
        (button) => button.textContent === mEn['clientNotes.create'],
      ),
    ).toBe(true);
  });

  it('disables the closed-editor Retry while its request is in flight', async () => {
    let resolveRetry: ((v: { status: string }) => void) | undefined;
    let attempts = 0;
    const onCreate = vi.fn<
      (b: string, k: string) => Promise<{ status: string }>
    >(() => {
      attempts += 1;
      if (attempts === 1) return Promise.resolve({ status: 'unavailable' });
      return new Promise((resolve) => {
        resolveRetry = resolve;
      });
    });
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate,
      canCreate: true,
    });
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'retry me'),
    );
    await act(async () => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const cancel = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.cancel'],
    )!;
    await act(async () => cancel.click());
    const discard = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.exitWarning.discard'],
    )!;
    await act(async () => discard.click());
    const retry = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.retry'],
    ) as HTMLButtonElement;

    await act(async () => {
      retry.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(retry.disabled).toBe(true);
    await act(async () => retry.click());
    expect(onCreate).toHaveBeenCalledTimes(2);
    await act(async () => resolveRetry?.({ status: 'unavailable' }));
  });

  it('pending: submit disabled while saving', async () => {
    let resolveCreate: ((v: { status: string }) => void) | undefined;
    const onCreate = vi.fn<
      (b: string, k: string) => Promise<{ status: string }>
    >(
      () =>
        new Promise<{ status: string }>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate,
      canCreate: true,
    });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'pending'));
    const submit = host!.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    await act(async () => {
      submit.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(submit.disabled).toBe(true);
    await act(async () => {
      resolveCreate?.({ status: 'ok' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it('empty state renders empty message', async () => {
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate: vi.fn(),
      canCreate: true,
    });
    expect(host!.textContent).toContain(mEn['clientNotes.empty']);
  });

  it('disabled create hides form when canCreate false', async () => {
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate: vi.fn(),
      canCreate: false,
    });
    expect(host!.querySelector('form')).toBeNull();
  });

  it('Bidi wraps mixed-direction text', async () => {
    const note = {
      id: 'n1',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'Hello 123',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [note],
      role: 'trainer',
      actorId: 'u1',
      canCreate: true,
    });
    expect(host!.innerHTML).toContain('<bdi');
    expect(host!.textContent).toContain('Hello 123');
  });

  it('timestamps rendered in local time', async () => {
    const previousTimeZone = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    const note = {
      id: 'n1',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'hello',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    try {
      await render({
        locale: 'en',
        messages: mEn,
        status: 'ready',
        notes: [note],
        role: 'trainer',
        actorId: 'u1',
        canCreate: true,
      });
      expect(host!.innerHTML).not.toContain('2026-11-08T10:15:00Z');
      expect(host!.textContent).toContain('8 Nov 2026, 2:15 AM');
    } finally {
      if (previousTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimeZone;
    }
  });

  it('edit editor: unsaved exit protection keeps/clears text', async () => {
    const note = {
      id: 'n1',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'hello',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    const onUpdate = vi.fn<
      (i: string, b: string) => Promise<{ status: string; error?: string }>
    >(async () => ({ status: 'error', error: 'boom' }));
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [note],
      role: 'trainer',
      actorId: 'u1',
      canCreate: true,
      onUpdate,
    });
    const editBtn = Array.from(host!.querySelectorAll('button')).find(
      (b) => b.textContent === mEn['clientNotes.edit'],
    )!;
    await act(async () => editBtn.click());
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'changed note'),
    );
    const cancel = Array.from(host!.querySelectorAll('button')).find(
      (b) => b.textContent === mEn['clientNotes.cancel'],
    )!;
    await act(async () => cancel.click());
    expect(host!.textContent).toContain(mEn['clientNotes.exitWarning.body']);
    const stay = Array.from(host!.querySelectorAll('button')).find(
      (b) => b.textContent === mEn['clientNotes.exitWarning.stay'],
    )!;
    await act(async () => stay.click());
    expect(host!.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => cancel.click());
    const discard = Array.from(host!.querySelectorAll('button')).find(
      (b) => b.textContent === mEn['clientNotes.exitWarning.discard'],
    )!;
    await act(async () => discard.click());
    expect(host!.querySelector('[role="dialog"]')).toBeNull();
  });

  it('edit editor: in-flight leaving shows row 34 and Discard does not cancel save', async () => {
    const note = {
      id: 'n1',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'hello',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    let resolveUpdate:
      ((v: { status: string; error?: string }) => void) | undefined;
    const onUpdate = vi.fn<
      (i: string, b: string) => Promise<{ status: string; error?: string }>
    >(
      () =>
        new Promise<{ status: string; error?: string }>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [note],
      role: 'trainer',
      actorId: 'u1',
      canCreate: true,
      onUpdate,
    });
    const editBtn = Array.from(host!.querySelectorAll('button')).find(
      (b) => b.textContent === mEn['clientNotes.edit'],
    )!;
    await act(async () => editBtn.click());
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'changed'));
    const save = Array.from(host!.querySelectorAll('button')).find(
      (b) => b.textContent === mEn['clientNotes.saveChanges'],
    )!;
    await act(async () => {
      save.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const cancel = Array.from(host!.querySelectorAll('button')).find(
      (b) => b.textContent === mEn['clientNotes.cancel'],
    )!;
    await act(async () => cancel.click());
    expect(host!.textContent).toContain(
      mEn['clientNotes.exitWarning.bodyInFlight'],
    );
    const discard = Array.from(host!.querySelectorAll('button')).find(
      (b) => b.textContent === mEn['clientNotes.exitWarning.discard'],
    )!;
    await act(async () => discard.click());
    expect(host!.querySelector('[role="dialog"]')).toBeNull();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveUpdate?.({ status: 'error', error: 'boom' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host!.textContent).toContain(mEn['clientNotes.saveError']);
    expect(host!.textContent).not.toContain('boom');
  });

  it('does not restore an unresolved edit after navigation or reload', async () => {
    const note = {
      id: 'n1',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'last committed body',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    const onUpdate = vi.fn(async () => ({ status: 'unavailable' }));
    const props = {
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [note],
      role: 'trainer',
      actorId: 'u1',
      canCreate: true,
      onUpdate,
    };
    await render(props);
    await act(async () => {
      Array.from(host!.querySelectorAll('button'))
        .find((button) => button.textContent === mEn['clientNotes.edit'])!
        .click();
    });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'unresolved edit text'));
    await act(async () => {
      Array.from(host!.querySelectorAll('button'))
        .find(
          (button) => button.textContent === mEn['clientNotes.saveChanges'],
        )!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(
      (host!.querySelector('textarea') as HTMLTextAreaElement).readOnly,
    ).toBe(true);
    expect(host!.textContent).toContain(mEn['clientNotes.saveError']);

    await act(async () => root?.unmount());
    const { createRoot } = await import('react-dom/client');
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root?.render(createElement(ClientNotes, props as never)),
    );
    expect(host!.textContent).toContain('last committed body');
    expect(host!.textContent).not.toContain('unresolved edit text');
    expect(host!.textContent).not.toContain(mEn['clientNotes.retry']);
    expect(host!.textContent).not.toContain(mEn['clientNotes.editedToast']);
  });

  it('closes an unknown edit on Discard and retries the retained body elsewhere in the tab', async () => {
    const note = {
      id: 'n-retry',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'committed body',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    const onUpdate = vi
      .fn()
      .mockResolvedValueOnce({ status: 'unavailable' })
      .mockResolvedValueOnce({ status: 'ok' });
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [note],
      role: 'trainer',
      actorId: 'u1',
      onUpdate,
    });
    const byText = (text: string) =>
      Array.from(host!.querySelectorAll('button')).find(
        (button) => button.textContent === text,
      )!;
    await act(async () => byText(mEn['clientNotes.edit']).click());
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'retained body'),
    );
    await act(async () => {
      byText(mEn['clientNotes.saveChanges']).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => byText(mEn['clientNotes.cancel']).click());
    await act(async () =>
      byText(mEn['clientNotes.exitWarning.discard']).click(),
    );

    expect(host!.querySelectorAll('textarea')).toHaveLength(1);
    expect((host!.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      '',
    );
    expect(host!.textContent).toContain(mEn['clientNotes.retry']);
    expect(host!.textContent).toContain('committed body');
    expect(host!.textContent).not.toContain('retained body');
    await act(async () => {
      byText(mEn['clientNotes.retry']).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onUpdate).toHaveBeenNthCalledWith(2, 'n-retry', 'retained body');
  });

  it('delete failures use approved generic copy only', async () => {
    const note = {
      id: 'n1',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'hello',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    const onDelete = vi.fn(async () => ({
      status: 'error',
      error: 'database secret',
    }));
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [note],
      role: 'platform_owner',
      actorId: 'po',
      onDelete,
    });
    const deleteButton = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.delete'],
    )!;
    await act(async () => deleteButton.click());
    const confirmDelete = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.deleteDialogConfirm'],
    )!;
    await act(async () => {
      confirmDelete.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onDelete).toHaveBeenCalledWith('n1');
    expect(host!.textContent).toContain(mEn['clientNotes.deleteError']);
    expect(host!.textContent).not.toContain('database secret');
  });
});

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
      button()!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(onLoadMore).toHaveBeenCalledWith({
      created_at: '2026-11-08T10:15:00Z',
      id: 'n1',
    });
    expect(host!.textContent).toContain('first page');
    expect(host!.textContent).toContain('second page');
    expect(button()).toBeUndefined();
  });

  it('resets loaded continuation rows when the first page changes', async () => {
    const note = (id: string, second: number) => ({
      id,
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: id,
      created_at: new Date(Date.UTC(2026, 10, 13, 0, 0, second)).toISOString(),
      edited_at: null,
    });
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      note(`page-${index}`, 300 - index),
    );
    const originalSecondPage = Array.from({ length: 100 }, (_, index) =>
      note(`page-${index + 100}`, 200 - index),
    );
    const refreshedFirstPage = [
      note('newer-insert', 400),
      ...firstPage.slice(0, 99),
    ];
    const resumedSecondPage = [
      firstPage[99]!,
      ...Array.from({ length: 99 }, (_, index) =>
        note(`page-${index + 100}`, 200 - index),
      ),
    ];
    const onLoadMore = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'ok',
        notes: originalSecondPage,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        status: 'ok',
        notes: resumedSecondPage,
        hasMore: false,
      });
    const props = {
      locale: 'en' as const,
      messages: mEn,
      status: 'ready' as const,
      notes: firstPage,
      hasMore: true,
      onLoadMore,
      canCreate: false,
    };
    await render(props);

    const loadMore = () =>
      Array.from(host!.querySelectorAll('button')).find(
        (button) => button.textContent === mEn['clientNotes.loadMore'],
      )!;
    await act(async () => loadMore().click());
    expect(host!.querySelectorAll('li')).toHaveLength(200);

    await act(async () =>
      root!.render(
        createElement(ClientNotes, {
          ...props,
          notes: refreshedFirstPage,
        }),
      ),
    );
    expect(host!.querySelectorAll('li')).toHaveLength(100);
    expect(host!.textContent).not.toContain('page-100');

    await act(async () => loadMore().click());
    expect(onLoadMore).toHaveBeenNthCalledWith(2, {
      created_at: refreshedFirstPage.at(-1)!.created_at,
      id: refreshedFirstPage.at(-1)!.id,
    });
    const renderedIds = Array.from(host!.querySelectorAll('li')).map(
      (item) => item.textContent?.match(/newer-insert|page-\d+/)?.[0] ?? null,
    );
    expect(host!.querySelectorAll('li')).toHaveLength(200);
    expect(new Set(renderedIds).size).toBe(200);
    expect(renderedIds).toEqual([
      ...refreshedFirstPage.map((item) => item.id),
      ...resumedSecondPage.map((item) => item.id),
    ]);
  });

  it('keeps the load-more cursor on the refreshed server page when an older edited row is retained', async () => {
    const note = (id: string, body: string, minute: number) => ({
      id,
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body,
      created_at: `2026-11-08T10:${String(minute).padStart(2, '0')}:00Z`,
      edited_at: null,
    });
    const olderEdited = note('n3', 'older page', 10);
    const onLoadMore = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'ok',
        notes: [olderEdited],
        hasMore: true,
      })
      .mockResolvedValueOnce({ status: 'ok', notes: [], hasMore: false });
    const firstPage = [
      note('n1', 'first page', 12),
      note('n2', 'last server row', 11),
    ];
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: firstPage,
      hasMore: true,
      onLoadMore,
      role: 'trainer',
      actorId: 'u1',
      canCreate: false,
    });
    const loadMore = () =>
      Array.from(host!.querySelectorAll('button')).find(
        (button) => button.textContent === mEn['clientNotes.loadMore'],
      )!;
    await act(async () => loadMore().click());
    const editOlder = Array.from(host!.querySelectorAll('li'))
      .find((item) => item.textContent?.includes('older page'))!
      .querySelector('button')!;
    await act(async () => editOlder.click());
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'dirty older edit'),
    );

    const refreshedFirstPage = [
      note('n0', 'new insert ahead of cursor', 13),
      ...firstPage,
    ];
    await act(async () =>
      root!.render(
        createElement(ClientNotes, {
          locale: 'en',
          messages: mEn,
          status: 'ready',
          notes: refreshedFirstPage,
          hasMore: true,
          onLoadMore,
          role: 'trainer',
          actorId: 'u1',
          canCreate: false,
        }),
      ),
    );
    expect(host!.textContent).toContain('dirty older edit');
    await act(async () => loadMore().click());
    expect(onLoadMore).toHaveBeenLastCalledWith({
      created_at: '2026-11-08T10:11:00Z',
      id: 'n2',
    });
  });

  it('keeps a saved note from a loaded page visible in place after refresh', async () => {
    const note = (id: string, body: string, minute: number) => ({
      id,
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body,
      created_at: `2026-11-08T10:${String(minute).padStart(2, '0')}:00Z`,
      edited_at: null as string | null,
    });
    const firstPage = [
      note('n1', 'first page one', 12),
      note('n2', 'first page two', 11),
    ];
    const olderNote = note('n3', 'older page note', 10);
    const refreshedFirstPage = [note('n0', 'new insert', 13), ...firstPage];
    const onLoadMore = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'ok',
        notes: [olderNote],
        hasMore: true,
      })
      .mockResolvedValueOnce({ status: 'ok', notes: [], hasMore: false });
    const onUpdate = vi.fn(async (noteId: string, body: string) => ({
      status: 'ok',
      note: {
        ...olderNote,
        id: noteId,
        body,
        edited_at: '2026-11-13T04:00:00Z',
      },
    }));
    const props: Record<string, unknown> = {
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: firstPage,
      hasMore: true,
      onLoadMore,
      onUpdate,
      onSuccess: () =>
        root!.render(
          createElement(ClientNotes, {
            ...props,
            notes: refreshedFirstPage,
          } as never),
        ),
      role: 'trainer',
      actorId: 'u1',
      canCreate: false,
      clientId: 'c',
      workspaceId: 'w',
    };
    await render(props);

    const buttonWithText = (text: string) =>
      Array.from(host!.querySelectorAll('button')).find(
        (button) => button.textContent === text,
      )!;
    await act(async () => buttonWithText(mEn['clientNotes.loadMore']).click());
    const olderRow = Array.from(host!.querySelectorAll('li')).find((item) =>
      item.textContent?.includes('older page note'),
    )!;
    await act(async () =>
      Array.from(olderRow.querySelectorAll('button'))
        .find((button) => button.textContent === mEn['clientNotes.edit'])!
        .click(),
    );
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'saved older note'),
    );
    await act(async () => {
      buttonWithText(mEn['clientNotes.saveChanges']).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const rowTexts = Array.from(host!.querySelectorAll('li')).map(
      (item) => item.textContent ?? '',
    );
    expect(rowTexts[0]).toContain('new insert');
    expect(rowTexts[1]).toContain('first page one');
    expect(rowTexts[2]).toContain('first page two');
    expect(rowTexts[3]).toContain('saved older note');
    expect(rowTexts[3]).not.toContain('older page note');
    expect(onUpdate).toHaveBeenCalledWith('n3', 'saved older note');

    await act(async () => buttonWithText(mEn['clientNotes.loadMore']).click());
    expect(onLoadMore).toHaveBeenLastCalledWith({
      created_at: firstPage[1]!.created_at,
      id: firstPage[1]!.id,
    });
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

  it('uses generic approved save copy for NUL create input and length guidance only for excess length', async () => {
    const onCreate = vi.fn(async () => ({ status: 'invalid_input' }));
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
      onCreate,
    });

    await act(async () =>
      setValue(host!.querySelector('textarea')!, String.fromCharCode(0)),
    );
    await act(async () => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host!.textContent).toContain(mEn['clientNotes.saveError']);
    expect(host!.textContent).not.toContain(mEn['clientNotes.tooLongError']);
    expect(onCreate).not.toHaveBeenCalled();

    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'x'.repeat(5001)),
    );
    await act(async () => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host!.textContent).toContain(mEn['clientNotes.tooLongError']);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('uses generic approved save copy for NUL update input and length guidance only for excess length', async () => {
    const note = {
      id: 'n-validation',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'original note',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    const onUpdate = vi.fn(async () => ({ status: 'invalid_input' }));
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [note],
      onUpdate,
      role: 'trainer',
      actorId: 'u1',
      canCreate: false,
    });

    const row = host!.querySelector('li')!;
    await act(async () =>
      Array.from(row.querySelectorAll('button'))
        .find((button) => button.textContent === mEn['clientNotes.edit'])!
        .click(),
    );
    await act(async () =>
      setValue(host!.querySelector('textarea')!, String.fromCharCode(0)),
    );
    await act(async () => {
      Array.from(host!.querySelectorAll('button'))
        .find(
          (button) => button.textContent === mEn['clientNotes.saveChanges'],
        )!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host!.textContent).toContain(mEn['clientNotes.saveError']);
    expect(host!.textContent).not.toContain(mEn['clientNotes.tooLongError']);
    expect(onUpdate).not.toHaveBeenCalled();

    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'x'.repeat(5001)),
    );
    await act(async () => {
      Array.from(host!.querySelectorAll('button'))
        .find(
          (button) => button.textContent === mEn['clientNotes.saveChanges'],
        )!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host!.textContent).toContain(mEn['clientNotes.tooLongError']);
    expect(onUpdate).not.toHaveBeenCalled();
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

  it.each(['unavailable', 'denied'] as const)(
    'does not let a delayed %s from the original create replace same-key Retry recovery',
    async (originalStatus) => {
      let resolveOriginal: ((result: { status: string }) => void) | undefined;
      let resolveRetry: ((result: { status: string }) => void) | undefined;
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
      await act(async () =>
        setValue(host!.querySelector('textarea')!, 'first'),
      );
      await act(async () => {
        host!
          .querySelector<HTMLButtonElement>('button[type="submit"]')!
          .click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const storageKey =
        'lifter-client-notes-pending-create:v1:workspace-1:client-1';
      const originalRecord = JSON.parse(
        dom!.window.sessionStorage.getItem(storageKey)!,
      ) as { idempotencyKey: string };
      const secondHost = dom!.window.document.createElement('div');
      dom!.window.document.body.append(secondHost);
      const { createRoot } = await import('react-dom/client');
      const secondRoot = createRoot(secondHost);
      await act(async () => {
        secondRoot.render(
          createElement(ClientNotes, {
            locale: 'en',
            messages: mEn,
            status: 'ready',
            notes: [],
            onCreate: vi.fn(
              () =>
                new Promise<{ status: string }>((resolve) => {
                  resolveRetry = resolve;
                }),
            ),
            canCreate: true,
            actorId: 'actor-1',
            clientId: 'client-1',
            workspaceId: 'workspace-1',
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const retry = Array.from(secondHost.querySelectorAll('button')).find(
        (button) => button.textContent === mEn['clientNotes.retry'],
      )!;
      await act(async () => {
        retry.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const latestRecord = JSON.parse(
        dom!.window.sessionStorage.getItem(storageKey)!,
      ) as { idempotencyKey: string; retrySent: boolean };
      expect(latestRecord).toMatchObject({
        idempotencyKey: originalRecord.idempotencyKey,
        retrySent: true,
      });

      await act(async () => {
        resolveOriginal?.({ status: originalStatus });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(dom!.window.sessionStorage.getItem(storageKey)).toBe(
        JSON.stringify(latestRecord),
      );

      await act(async () => {
        resolveRetry?.({ status: 'unavailable' });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await act(async () => secondRoot.unmount());
      secondHost.remove();
    },
  );

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
    const dispatchRecords: Array<{
      body: string;
      idempotencyKey: string;
      storedBody: string;
      storedIdempotencyKey: string;
      retrySent: boolean;
    }> = [];
    const onCreate = vi.fn(async (body: string, key: string) => {
      calls += 1;
      const stored = JSON.parse(
        dom!.window.sessionStorage.getItem(
          'lifter-client-notes-pending-create:v1:workspace-1:client-1',
        )!,
      ) as { body: string; idempotencyKey: string; retrySent: boolean };
      dispatchRecords.push({
        body,
        idempotencyKey: key,
        storedBody: stored.body,
        storedIdempotencyKey: stored.idempotencyKey,
        retrySent: stored.retrySent,
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
    expect(dispatchRecords).toEqual([
      {
        body: 'retained body',
        idempotencyKey: key,
        storedBody: 'retained body',
        storedIdempotencyKey: key,
        retrySent: false,
      },
      {
        body: 'retained body',
        idempotencyKey: key,
        storedBody: 'retained body',
        storedIdempotencyKey: key,
        retrySent: true,
      },
    ]);
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
    expect(host!.querySelector('dialog')).toBeNull();
    expect((host!.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      'unsaved',
    );
    await act(async () => cancel.click());
    const discard = Array.from(host!.querySelectorAll('button')).find(
      (b) => b.textContent === mEn['clientNotes.exitWarning.discard'],
    )!;
    await act(async () => discard.click());
    expect(host!.querySelector('dialog')).toBeNull();
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

  it('protects same-origin in-app navigation with the approved Stay/Discard warning', async () => {
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [],
    });
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'unsaved'),
    );
    const link = dom!.window.document.createElement('a');
    link.href = '/home';
    link.textContent = 'Home';
    dom!.window.document.body.append(link);
    let replayedNavigation = 0;
    let captureReplay = false;
    link.addEventListener('click', (event) => {
      if (!captureReplay) return;
      replayedNavigation += 1;
      event.preventDefault();
    });

    const click = () =>
      link.dispatchEvent(
        new dom!.window.MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    let prevented = false;
    await act(async () => {
      prevented = !click();
    });
    expect(prevented).toBe(true);
    const dialog = host!.querySelector('dialog')!;
    expect(dialog.textContent).toContain(mEn['clientNotes.exitWarning.title']);
    expect(dialog.textContent).toContain(mEn['clientNotes.exitWarning.body']);
    expect(dialog.textContent).toContain(mEn['clientNotes.exitWarning.stay']);
    expect(dialog.textContent).toContain(
      mEn['clientNotes.exitWarning.discard'],
    );
    const stay = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.exitWarning.stay'],
    )!;
    await act(async () => stay.click());
    expect(host!.querySelector('textarea')).not.toBeNull();

    await act(async () => {
      prevented = !click();
    });
    expect(prevented).toBe(true);
    const discard = Array.from(
      host!.querySelectorAll<HTMLButtonElement>('dialog button'),
    ).find(
      (button) => button.textContent === mEn['clientNotes.exitWarning.discard'],
    )!;
    captureReplay = true;
    await act(async () => discard.click());
    expect(replayedNavigation).toBe(1);
    expect(host!.querySelector('textarea')).toBeNull();
  });

  it('keeps navigation and beforeunload protection armed for a discarded unknown edit', async () => {
    const note = {
      id: 'n-pending-edit',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'committed body',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    const onUpdate = vi.fn(async () => ({ status: 'unavailable' }));
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [note],
      role: 'trainer',
      actorId: 'u1',
      onUpdate,
      canCreate: false,
    });
    const byText = (text: string) =>
      Array.from(host!.querySelectorAll('button')).find(
        (button) => button.textContent === text,
      )!;
    await act(async () => byText(mEn['clientNotes.edit']).click());
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'retained edit'),
    );
    await act(async () => {
      byText(mEn['clientNotes.saveChanges']).click();
      byText(mEn['clientNotes.saveChanges']).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    await act(async () => byText(mEn['clientNotes.cancel']).click());
    await act(async () =>
      byText(mEn['clientNotes.exitWarning.discard']).click(),
    );

    const unload = new dom!.window.Event('beforeunload', { cancelable: true });
    dom!.window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    const link = dom!.window.document.createElement('a');
    link.href = '/home';
    dom!.window.document.body.append(link);
    const click = new dom!.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    await act(async () => link.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(true);
    expect(host!.querySelector('dialog')?.textContent).toContain(
      mEn['clientNotes.saveError'],
    );
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

  it('keeps exit protection armed after discarding an edit while its save is in flight', async () => {
    const note = {
      id: 'n-inflight-exit',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'before save',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    let resolveUpdate: ((result: { status: string }) => void) | undefined;
    const onUpdate = vi.fn(
      () =>
        new Promise<{ status: string }>((resolve) => {
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
      canCreate: false,
      onUpdate,
    });
    const byText = (text: string) =>
      Array.from(host!.querySelectorAll('button')).find(
        (button) => button.textContent === text,
      )!;
    await act(async () => byText(mEn['clientNotes.edit']).click());
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'after save'),
    );
    await act(async () => {
      byText(mEn['clientNotes.saveChanges']).click();
      byText(mEn['clientNotes.saveChanges']).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    await act(async () => byText(mEn['clientNotes.cancel']).click());
    expect(host!.textContent).toContain(
      mEn['clientNotes.exitWarning.bodyInFlight'],
    );
    await act(async () =>
      byText(mEn['clientNotes.exitWarning.discard']).click(),
    );

    const unload = new dom!.window.Event('beforeunload', { cancelable: true });
    dom!.window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    const link = dom!.window.document.createElement('a');
    link.href = '/home';
    dom!.window.document.body.append(link);
    const navigation = new dom!.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    await act(async () => link.dispatchEvent(navigation));
    expect(navigation.defaultPrevented).toBe(true);
    expect(host!.querySelector('dialog')?.textContent).toContain(
      mEn['clientNotes.exitWarning.bodyInFlight'],
    );
    expect(onUpdate).toHaveBeenCalledTimes(1);
    await act(async () => resolveUpdate?.({ status: 'ok' }));
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
    expect(host!.querySelector('dialog')).toBeNull();
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

  it('confirms before switching away from a dirty note edit', async () => {
    const notes = ['first', 'second'].map((body, index) => ({
      id: `n${index + 1}`,
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body,
      created_at: `2026-11-08T10:1${index}:00Z`,
      edited_at: null,
    }));
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes,
      role: 'trainer',
      actorId: 'u1',
      canCreate: false,
    });
    const editButton = (index: number) =>
      host!.querySelectorAll('li')[index]!.querySelector('button')!;
    const firstEdit = editButton(0);
    await act(async () => firstEdit.click());
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'dirty first'),
    );

    await act(async () => editButton(1).click());
    expect(host!.querySelector('dialog')?.textContent).toContain(
      mEn['clientNotes.exitWarning.body'],
    );
    expect((host!.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      'dirty first',
    );
    const stay = Array.from(
      host!.querySelectorAll<HTMLButtonElement>('dialog button'),
    ).find(
      (button) => button.textContent === mEn['clientNotes.exitWarning.stay'],
    )!;
    await act(async () => stay.click());
    expect((host!.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      'dirty first',
    );

    await act(async () => editButton(1).click());
    const discard = Array.from(
      host!.querySelectorAll<HTMLButtonElement>('dialog button'),
    ).find(
      (button) => button.textContent === mEn['clientNotes.exitWarning.discard'],
    )!;
    await act(async () => discard.click());
    expect((host!.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      'second',
    );
    expect(
      host!.querySelectorAll('li')[0]!.querySelector('textarea'),
    ).toBeNull();
  });

  it('retains the dirty edit if the requested switch target disappears', async () => {
    const notes = ['first', 'second'].map((body, index) => ({
      id: `n${index + 1}`,
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body,
      created_at: `2026-11-08T10:1${index}:00Z`,
      edited_at: null,
    }));
    const props = {
      locale: 'en' as const,
      messages: mEn,
      status: 'ready' as const,
      notes,
      role: 'trainer',
      actorId: 'u1',
      canCreate: false,
    };
    await render(props);
    const editButton = (index: number) =>
      host!.querySelectorAll('li')[index]!.querySelector('button')!;
    await act(async () => editButton(0).click());
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'keep this draft'),
    );
    await act(async () => editButton(1).click());
    await act(async () =>
      root!.render(
        createElement(ClientNotes, { ...props, notes: [notes[0]!] }),
      ),
    );
    const discard = Array.from(
      host!.querySelectorAll<HTMLButtonElement>('dialog button'),
    ).find(
      (button) => button.textContent === mEn['clientNotes.exitWarning.discard'],
    )!;
    await act(async () => discard.click());
    expect(host!.querySelector('dialog')).toBeNull();
    expect(host!.querySelector('textarea')?.value).toBe('keep this draft');
    expect(host!.querySelectorAll('li')).toHaveLength(1);
  });

  it('keeps the active edit warning ahead of pending-create recovery', async () => {
    const storageKey =
      'lifter-client-notes-pending-create:v1:workspace-1:client-1';
    const record = {
      tabId: 'tab-1',
      actorId: 'actor-1',
      clientId: 'client-1',
      workspaceId: 'workspace-1',
      text: 'pending create',
      body: 'pending create',
      idempotencyKey: 'create-key',
      retrySent: true,
    };
    await render(
      {
        locale: 'en',
        messages: mEn,
        status: 'ready',
        notes: [
          {
            id: 'edit-note',
            workspace_id: 'workspace-1',
            client_id: 'client-1',
            author_user_id: 'actor-1',
            body: 'original edit',
            created_at: '2026-11-08T10:15:00Z',
            edited_at: null,
          },
        ],
        onCreate: vi.fn(async () => ({ status: 'unavailable' })),
        canCreate: true,
        actorId: 'actor-1',
        clientId: 'client-1',
        workspaceId: 'workspace-1',
        role: 'trainer',
      },
      {
        windowName: 'lifter-client-notes-tab:v1:tab-1',
        session: { [storageKey]: JSON.stringify(record) },
      },
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    const edit = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.edit'],
    )!;
    await act(async () => edit.click());
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'dirty edit'),
    );
    const cancel = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.cancel'],
    )!;
    await act(async () => cancel.click());
    const dialog = host!.querySelector('dialog')!;
    expect(dialog.textContent).toContain(mEn['clientNotes.exitWarning.body']);
    expect(dialog.textContent).not.toContain(mEn['clientNotes.saveError']);
    const discard = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.exitWarning.discard'],
    )!;
    await act(async () => discard.click());
    expect(host!.querySelector('dialog')).toBeNull();
    expect(host!.textContent).toContain(mEn['clientNotes.retry']);
    expect(dom!.window.sessionStorage.getItem(storageKey)).toBe(
      JSON.stringify(record),
    );
  });

  it('preserves an unknown edit when pending-create recovery also exists', async () => {
    const storageKey =
      'lifter-client-notes-pending-create:v1:workspace-1:client-1';
    const record = {
      tabId: 'tab-1',
      actorId: 'actor-1',
      clientId: 'client-1',
      workspaceId: 'workspace-1',
      text: 'pending create',
      body: 'pending create',
      idempotencyKey: 'create-key',
      retrySent: true,
    };
    await render(
      {
        locale: 'en',
        messages: mEn,
        status: 'ready',
        notes: [
          {
            id: 'edit-note',
            workspace_id: 'workspace-1',
            client_id: 'client-1',
            author_user_id: 'actor-1',
            body: 'original edit',
            created_at: '2026-11-08T10:15:00Z',
            edited_at: null,
          },
        ],
        onCreate: vi.fn(async () => ({ status: 'unavailable' })),
        onUpdate: vi.fn(async () => ({ status: 'unavailable' })),
        canCreate: true,
        actorId: 'actor-1',
        clientId: 'client-1',
        workspaceId: 'workspace-1',
        role: 'trainer',
      },
      {
        windowName: 'lifter-client-notes-tab:v1:tab-1',
        session: { [storageKey]: JSON.stringify(record) },
      },
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    const edit = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.edit'],
    )!;
    await act(async () => edit.click());
    await act(async () =>
      setValue(host!.querySelector('li textarea')!, 'dirty edit'),
    );
    const save = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.saveChanges'],
    )!;
    await act(async () => {
      save.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const cancel = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.cancel'],
    )!;
    await act(async () => cancel.click());
    const discard = Array.from(
      host!.querySelectorAll<HTMLButtonElement>('dialog button'),
    ).find(
      (button) => button.textContent === mEn['clientNotes.exitWarning.discard'],
    )!;
    await act(async () => discard.click());
    expect(host!.querySelector('li textarea')).toBeNull();
    expect(host!.textContent).toContain(mEn['clientNotes.retry']);
    expect(dom!.window.sessionStorage.getItem(storageKey)).toBe(
      JSON.stringify(record),
    );
  });

  it('keeps delete failure visible without an open editor', async () => {
    const note = {
      id: 'n-delete',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'kept after denied delete',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [note],
      role: 'platform_owner',
      actorId: 'owner',
      canCreate: false,
      onDelete: vi.fn(async () => ({ status: 'denied' })),
    });
    const deleteButton = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.delete'],
    )!;
    await act(async () => deleteButton.click());
    const confirm = Array.from(
      host!.querySelectorAll<HTMLButtonElement>('dialog button'),
    ).find(
      (button) => button.textContent === mEn['clientNotes.deleteDialogConfirm'],
    )!;
    await act(async () => {
      confirm.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host!.textContent).toContain(mEn['clientNotes.permissionRefused']);
    expect(host!.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('disables only the deleting note control until its delete request settles', async () => {
    const note = {
      id: 'delete-inflight',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'delete is pending',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    let resolveDelete: ((result: { status: string }) => void) | undefined;
    const onDelete = vi.fn(
      () =>
        new Promise<{ status: string }>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const otherNote = { ...note, id: 'delete-other', body: 'other row' };
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [note, otherNote],
      role: 'platform_owner',
      actorId: 'owner',
      canCreate: false,
      onDelete,
    });
    const row = Array.from(host!.querySelectorAll('li')).find((item) =>
      item.textContent?.includes(note.body),
    )!;
    const deleteButton = Array.from(row.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.delete'],
    )!;
    await act(async () => deleteButton.click());
    const confirm = Array.from(
      host!.querySelectorAll<HTMLButtonElement>('dialog button'),
    ).find(
      (button) => button.textContent === mEn['clientNotes.deleteDialogConfirm'],
    )!;
    await act(async () => {
      confirm.click();
      confirm.click();
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(deleteButton.disabled).toBe(true);
    const editFor = (body: string) => {
      const targetRow = Array.from(host!.querySelectorAll('li')).find((item) =>
        item.textContent?.includes(body),
      )!;
      return Array.from(
        targetRow.querySelectorAll<HTMLButtonElement>('button'),
      ).find((button) => button.textContent === mEn['clientNotes.edit']);
    };
    expect(editFor(note.body)?.disabled).toBe(true);
    expect(editFor(otherNote.body)?.disabled).toBe(false);
    await act(async () => deleteButton.click());
    expect(onDelete).toHaveBeenCalledTimes(1);

    await act(async () => resolveDelete?.({ status: 'denied' }));
    expect(deleteButton.disabled).toBe(false);
    expect(editFor(note.body)?.disabled).toBe(false);
    expect(host!.textContent).toContain(mEn['clientNotes.permissionRefused']);
  });

  it('removes a deleted later-page note without moving the server cursor or resurrecting it from an in-flight page', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `page-${index}`,
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: `page note ${index}`,
      created_at: `2026-11-12T10:${String(index % 60).padStart(2, '0')}:00Z`,
      edited_at: null,
    }));
    const deletedNote = {
      id: 'deleted-page-two',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'deleted page two note',
      created_at: '2026-11-11T10:00:00Z',
      edited_at: null,
    };
    let finishSecondPage:
      | ((value: {
          status: 'ok';
          notes: (typeof deletedNote)[];
          hasMore: boolean;
        }) => void)
      | undefined;
    const nextNote = {
      ...deletedNote,
      id: 'page-three',
      body: 'page three note',
    };
    const onLoadMore = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'ok',
        notes: [deletedNote],
        hasMore: true,
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishSecondPage = resolve;
          }),
      );
    const onDelete = vi.fn(async () => ({ status: 'ok' as const }));
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: firstPage,
      hasMore: true,
      onLoadMore,
      onDelete,
      role: 'platform_owner',
      actorId: 'owner',
      canCreate: false,
    });
    const byText = (text: string) =>
      Array.from(host!.querySelectorAll('button')).find(
        (button) => button.textContent === text,
      )!;
    await act(async () => byText(mEn['clientNotes.loadMore']).click());
    expect(host!.textContent).toContain(deletedNote.body);
    await act(async () => byText(mEn['clientNotes.loadMore']).click());

    const deletedRow = Array.from(host!.querySelectorAll('li')).find((row) =>
      row.textContent?.includes(deletedNote.body),
    )!;
    await act(async () =>
      Array.from(deletedRow.querySelectorAll('button'))
        .find((button) => button.textContent === mEn['clientNotes.delete'])!
        .click(),
    );
    await act(async () =>
      byText(mEn['clientNotes.deleteDialogConfirm']).click(),
    );

    expect(host!.textContent).not.toContain(deletedNote.body);
    expect(onLoadMore).toHaveBeenNthCalledWith(2, {
      created_at: deletedNote.created_at,
      id: deletedNote.id,
    });

    await act(async () =>
      finishSecondPage?.({
        status: 'ok',
        notes: [deletedNote, nextNote],
        hasMore: false,
      }),
    );
    expect(host!.textContent).not.toContain(deletedNote.body);
    expect(host!.textContent).toContain(nextNote.body);
    expect(host!.querySelectorAll('li')).toHaveLength(firstPage.length + 1);
  });

  it('retains an off-page edited note when a refreshed first page replaces loaded pages', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `page-${index}`,
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: `page note ${index}`,
      created_at: `2026-11-12T10:${String(index % 60).padStart(2, '0')}:00Z`,
      edited_at: null,
    }));
    const offPageNote = {
      id: 'off-page-note',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'off-page original',
      created_at: '2026-11-11T10:00:00Z',
      edited_at: null,
    };
    const props = {
      locale: 'en' as const,
      messages: mEn,
      status: 'ready' as const,
      notes: firstPage,
      hasMore: true,
      onLoadMore: vi.fn(async () => ({
        status: 'ok',
        notes: [offPageNote],
        hasMore: false,
      })),
      role: 'trainer',
      actorId: 'u1',
      canCreate: false,
    };
    await render(props);
    const loadMore = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.loadMore'],
    )!;
    await act(async () => loadMore.click());
    const offPageRow = Array.from(host!.querySelectorAll('li')).find((item) =>
      item.textContent?.includes(offPageNote.body),
    )!;
    await act(async () =>
      Array.from(offPageRow.querySelectorAll('button'))
        .find((button) => button.textContent === mEn['clientNotes.edit'])!
        .click(),
    );
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'dirty off-page draft'),
    );

    await act(async () =>
      root!.render(
        createElement(ClientNotes, {
          ...props,
          notes: firstPage.slice(1),
          hasMore: true,
        }),
      ),
    );

    expect(host!.querySelector('textarea')?.value).toBe('dirty off-page draft');
    await act(async () => {
      Array.from(host!.querySelectorAll('button'))
        .find((button) => button.textContent === mEn['clientNotes.cancel'])!
        .click();
    });
    expect(host!.querySelector('dialog')?.textContent).toContain(
      mEn['clientNotes.exitWarning.body'],
    );
    expect(host!.querySelector('textarea')?.value).toBe('dirty off-page draft');
  });

  it('keeps another note editor active when an older update succeeds late', async () => {
    let resolveFirst: ((value: { status: string }) => void) | undefined;
    const notes = ['note A original', 'note B original'].map((body, index) => ({
      id: `note-${index}`,
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body,
      created_at: `2026-11-08T10:1${index}:00Z`,
      edited_at: null,
    }));
    const onUpdate = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ status: 'ok' });
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes,
      onUpdate,
      role: 'trainer',
      actorId: 'u1',
      canCreate: false,
    });
    const rowFor = (body: string) =>
      Array.from(host!.querySelectorAll('li')).find((item) =>
        item.textContent?.includes(body),
      )!;
    await act(async () =>
      Array.from(rowFor('note A original').querySelectorAll('button'))
        .find((button) => button.textContent === mEn['clientNotes.edit'])!
        .click(),
    );
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'note A submitted body'),
    );
    await act(async () => {
      Array.from(host!.querySelectorAll('button'))
        .find(
          (button) => button.textContent === mEn['clientNotes.saveChanges'],
        )!
        .click();
    });
    await act(async () =>
      Array.from(rowFor('note B original').querySelectorAll('button'))
        .find((button) => button.textContent === mEn['clientNotes.edit'])!
        .click(),
    );
    await act(async () => {
      Array.from(host!.querySelectorAll<HTMLButtonElement>('dialog button'))
        .find(
          (button) =>
            button.textContent === mEn['clientNotes.exitWarning.discard'],
        )!
        .click();
    });
    expect(host!.querySelector('textarea')?.value).toBe('note B original');

    await act(async () => {
      resolveFirst?.({ status: 'ok' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host!.querySelector('textarea')?.value).toBe('note B original');
    expect(host!.textContent).toContain(mEn['clientNotes.saveChanges']);
  });

  it('keeps a stale unknown update retry separate from the active note editor', async () => {
    let resolveFirst: ((value: { status: string }) => void) | undefined;
    const notes = ['note A original', 'note B original'].map((body, index) => ({
      id: `note-${index}`,
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body,
      created_at: `2026-11-08T10:1${index}:00Z`,
      edited_at: null,
    }));
    const onUpdate = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ status: 'ok' });
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes,
      onUpdate,
      role: 'trainer',
      actorId: 'u1',
      canCreate: false,
    });
    const rowFor = (body: string) =>
      Array.from(host!.querySelectorAll('li')).find((item) =>
        item.textContent?.includes(body),
      )!;
    await act(async () =>
      Array.from(rowFor('note A original').querySelectorAll('button'))
        .find((button) => button.textContent === mEn['clientNotes.edit'])!
        .click(),
    );
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'note A submitted body'),
    );
    await act(async () => {
      Array.from(host!.querySelectorAll('button'))
        .find(
          (button) => button.textContent === mEn['clientNotes.saveChanges'],
        )!
        .click();
    });
    await act(async () =>
      Array.from(rowFor('note B original').querySelectorAll('button'))
        .find((button) => button.textContent === mEn['clientNotes.edit'])!
        .click(),
    );
    await act(async () => {
      Array.from(host!.querySelectorAll<HTMLButtonElement>('dialog button'))
        .find(
          (button) =>
            button.textContent === mEn['clientNotes.exitWarning.discard'],
        )!
        .click();
    });

    await act(async () => {
      resolveFirst?.({ status: 'unavailable' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const activeEditor = host!.querySelector('textarea')!;
    expect(activeEditor.value).toBe('note B original');
    expect(activeEditor.readOnly).toBe(false);
    const retry = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent === mEn['clientNotes.retry'],
    )!;
    await act(async () => {
      retry.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onUpdate).toHaveBeenNthCalledWith(
      2,
      'note-0',
      'note A submitted body',
    );
    expect(host!.querySelector('textarea')?.value).toBe('note B original');
    expect(host!.textContent).toContain(mEn['clientNotes.saveChanges']);
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
    expect(host!.querySelector('dialog')).toBeNull();
    await act(async () => cancel.click());
    const discard = Array.from(host!.querySelectorAll('button')).find(
      (b) => b.textContent === mEn['clientNotes.exitWarning.discard'],
    )!;
    await act(async () => discard.click());
    expect(host!.querySelector('dialog')).toBeNull();
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
      role: 'platform_owner',
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
    expect(host!.querySelector('dialog')).toBeNull();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const deleteControl = Array.from(
      host!.querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent === mEn['clientNotes.delete'])!;
    expect(deleteControl.disabled).toBe(true);
    await act(async () => {
      resolveUpdate?.({ status: 'error', error: 'boom' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host!.textContent).toContain(mEn['clientNotes.saveError']);
    expect(host!.textContent).not.toContain('boom');
    expect(deleteControl.disabled).toBe(false);
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
      .mockResolvedValueOnce({ status: 'denied' })
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
    expect(
      Array.from(host!.querySelectorAll('[role="alert"]')).some((alert) =>
        alert.textContent?.includes(mEn['clientNotes.permissionRefused']),
      ),
    ).toBe(true);
    expect(host!.textContent).toContain(mEn['clientNotes.retry']);
    expect(onUpdate).toHaveBeenNthCalledWith(2, 'n-retry', 'retained body');
    await act(async () => {
      byText(mEn['clientNotes.retry']).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(
      Array.from(host!.querySelectorAll('[role="alert"]')).some((alert) =>
        alert.textContent?.includes(mEn['clientNotes.saveError']),
      ),
    ).toBe(true);
    expect(onUpdate).toHaveBeenNthCalledWith(3, 'n-retry', 'retained body');
    await act(async () => {
      byText(mEn['clientNotes.retry']).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onUpdate).toHaveBeenNthCalledWith(4, 'n-retry', 'retained body');
    expect(host!.textContent).not.toContain(mEn['clientNotes.retry']);
  });

  it('clears a deleted note pending edit so other notes can be edited', async () => {
    const notes = ['first note', 'second note'].map((body, index) => ({
      id: `n${index + 1}`,
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body,
      created_at: `2026-11-08T10:1${index}:00Z`,
      edited_at: null,
    }));
    const onUpdate = vi.fn(async () => ({ status: 'unavailable' }));
    let resolveDelete: ((result: { status: string }) => void) | undefined;
    const onDelete = vi.fn(
      () =>
        new Promise<{ status: string }>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const props = {
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes,
      role: 'platform_owner',
      actorId: 'u1',
      onUpdate,
      onDelete,
      canCreate: false,
    } as const;
    await render(props);
    const byText = (text: string) =>
      Array.from(host!.querySelectorAll('button')).find(
        (button) => button.textContent === text,
      )!;
    await act(async () => byText(mEn['clientNotes.edit']).click());
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'retained body'),
    );
    await act(async () => byText(mEn['clientNotes.saveChanges']).click());
    await act(async () => byText(mEn['clientNotes.cancel']).click());
    await act(async () =>
      byText(mEn['clientNotes.exitWarning.discard']).click(),
    );
    expect(host!.textContent).toContain(mEn['clientNotes.retry']);
    expect(
      Array.from(host!.querySelectorAll('button')).filter(
        (button) => button.textContent === mEn['clientNotes.edit'],
      ),
    ).toHaveLength(0);

    const deletedRow = Array.from(host!.querySelectorAll('li')).find((row) =>
      row.textContent?.includes(notes[0]!.body),
    )!;
    await act(async () =>
      Array.from(deletedRow.querySelectorAll('button'))
        .find((button) => button.textContent === mEn['clientNotes.delete'])!
        .click(),
    );
    await act(async () =>
      byText(mEn['clientNotes.deleteDialogConfirm']).click(),
    );
    const retry = byText(mEn['clientNotes.retry']);
    expect(retry.disabled).toBe(true);
    await act(async () => resolveDelete?.({ status: 'ok' }));

    expect(onDelete).toHaveBeenCalledWith('n1');
    expect(host!.textContent).not.toContain(mEn['clientNotes.retry']);
    await act(async () =>
      root!.render(
        createElement(ClientNotes, { ...props, notes: [notes[1]!] }),
      ),
    );
    expect(host!.querySelectorAll('li')).toHaveLength(1);
    expect(
      Array.from(host!.querySelectorAll('button')).filter(
        (button) => button.textContent === mEn['clientNotes.edit'],
      ),
    ).toHaveLength(1);
  });

  it('does not discard a create draft when the captured edit saves before confirmation', async () => {
    const note = {
      id: 'n-edit',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'saved body',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    let resolveUpdate:
      ((result: { status: string; note?: typeof note }) => void) | undefined;
    const onUpdate = vi.fn(
      () =>
        new Promise<{ status: string; note?: typeof note }>((resolve) => {
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
      onUpdate,
      canCreate: true,
    });
    const byText = (text: string) =>
      Array.from(host!.querySelectorAll('button')).find(
        (button) => button.textContent === text,
      )!;
    const createTextarea =
      host!.querySelector<HTMLTextAreaElement>('form textarea')!;
    await act(async () => setValue(createTextarea, 'keep this create draft'));
    await act(async () => byText(mEn['clientNotes.edit']).click());
    const editTextarea =
      host!.querySelector<HTMLTextAreaElement>('li textarea')!;
    await act(async () => setValue(editTextarea, 'saved body updated'));
    await act(async () => {
      byText(mEn['clientNotes.saveChanges']).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => byText(mEn['clientNotes.cancel']).click());
    expect(host!.querySelector('dialog')).not.toBeNull();

    await act(async () => {
      resolveUpdate?.({
        status: 'ok',
        note: { ...note, body: 'saved body updated' },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host!.querySelector('dialog')).not.toBeNull();
    await act(async () =>
      byText(mEn['clientNotes.exitWarning.discard']).click(),
    );

    expect(host!.querySelector('dialog')).toBeNull();
    expect(host!.querySelector('form textarea')).not.toBeNull();
    expect(
      (host!.querySelector('form textarea') as HTMLTextAreaElement).value,
    ).toBe('keep this create draft');
    expect(host!.textContent).toContain('saved body');
  });

  it('does not replay navigation after the captured edit saves while its warning is open', async () => {
    const note = {
      id: 'n-navigation-edit',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'committed edit',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    let resolveUpdate:
      ((result: { status: string; note?: typeof note }) => void) | undefined;
    const onUpdate = vi.fn(
      () =>
        new Promise<{ status: string; note?: typeof note }>((resolve) => {
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
      onUpdate,
      canCreate: true,
    });
    const byText = (text: string) =>
      Array.from(host!.querySelectorAll('button')).find(
        (button) => button.textContent === text,
      )!;
    await act(async () =>
      setValue(host!.querySelector('form textarea')!, 'separate create draft'),
    );
    await act(async () => byText(mEn['clientNotes.edit']).click());
    await act(async () =>
      setValue(host!.querySelector('li textarea')!, 'submitted edit'),
    );
    await act(async () => {
      byText(mEn['clientNotes.saveChanges']).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const link = dom!.window.document.createElement('a');
    link.href = '/home';
    link.textContent = 'Home';
    dom!.window.document.body.append(link);
    let replayedNavigation = 0;
    let captureReplay = false;
    link.addEventListener('click', (event) => {
      if (!captureReplay) return;
      replayedNavigation += 1;
      event.preventDefault();
    });
    await act(async () =>
      link.dispatchEvent(
        new dom!.window.MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      ),
    );
    expect(host!.querySelector('dialog')).not.toBeNull();
    await act(async () => {
      resolveUpdate?.({
        status: 'ok',
        note: { ...note, body: 'submitted edit' },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    captureReplay = true;
    await act(async () =>
      byText(mEn['clientNotes.exitWarning.discard']).click(),
    );

    expect(replayedNavigation).toBe(0);
    expect(host!.querySelector('dialog')).toBeNull();
    expect(
      (host!.querySelector('form textarea') as HTMLTextAreaElement).value,
    ).toBe('separate create draft');
    await act(async () => byText(mEn['clientNotes.cancel']).click());
    await act(async () =>
      byText(mEn['clientNotes.exitWarning.discard']).click(),
    );
    expect(replayedNavigation).toBe(0);
  });

  it('keeps the captured edit target when another note delete resolves under the warning', async () => {
    const notes = ['edited row', 'deleted row'].map((body, index) => ({
      id: `n${index + 1}`,
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body,
      created_at: `2026-11-08T10:1${index}:00Z`,
      edited_at: null,
    }));
    let resolveDelete: ((result: { status: string }) => void) | undefined;
    const onDelete = vi.fn(
      () =>
        new Promise<{ status: string }>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes,
      role: 'platform_owner',
      actorId: 'u1',
      onDelete,
      canCreate: false,
    });
    const byText = (text: string) =>
      Array.from(host!.querySelectorAll('button')).find(
        (button) => button.textContent === text,
      )!;
    const deletedRow = Array.from(host!.querySelectorAll('li')).find((row) =>
      row.textContent?.includes('deleted row'),
    )!;
    await act(async () =>
      Array.from(deletedRow.querySelectorAll('button'))
        .find((button) => button.textContent === mEn['clientNotes.delete'])!
        .click(),
    );
    await act(async () =>
      byText(mEn['clientNotes.deleteDialogConfirm']).click(),
    );
    await act(async () => byText(mEn['clientNotes.edit']).click());
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'edited draft'),
    );
    await act(async () => byText(mEn['clientNotes.cancel']).click());
    expect(host!.querySelector('dialog')?.textContent).toContain(
      mEn['clientNotes.exitWarning.body'],
    );

    await act(async () => resolveDelete?.({ status: 'ok' }));
    await act(async () =>
      byText(mEn['clientNotes.exitWarning.discard']).click(),
    );
    expect(onDelete).toHaveBeenCalledWith('n2');
    expect(host!.querySelector('dialog')).toBeNull();
    expect(host!.querySelector('textarea')).toBeNull();
    expect(host!.textContent).toContain('edited row');
  });

  it('keeps the create draft as the warning target while a pending edit Retry resolves', async () => {
    const note = {
      id: 'n-retry-dialog',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'committed',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    let resolveRetry:
      ((result: { status: string; note?: typeof note }) => void) | undefined;
    const onUpdate = vi
      .fn()
      .mockResolvedValueOnce({ status: 'unavailable' })
      .mockImplementationOnce(
        () =>
          new Promise<{ status: string; note?: typeof note }>((resolve) => {
            resolveRetry = resolve;
          }),
      );
    await render({
      locale: 'en',
      messages: mEn,
      status: 'ready',
      notes: [note],
      role: 'platform_owner',
      actorId: 'u1',
      onUpdate,
      canCreate: true,
    });
    const byText = (text: string) =>
      Array.from(host!.querySelectorAll('button')).find(
        (button) => button.textContent === text,
      )!;
    await act(async () => byText(mEn['clientNotes.edit']).click());
    await act(async () =>
      setValue(host!.querySelector('textarea')!, 'retry body'),
    );
    await act(async () => byText(mEn['clientNotes.saveChanges']).click());
    await act(async () => byText(mEn['clientNotes.cancel']).click());
    await act(async () =>
      byText(mEn['clientNotes.exitWarning.discard']).click(),
    );

    await act(async () =>
      setValue(host!.querySelector('form textarea')!, 'create draft'),
    );
    await act(async () => {
      byText(mEn['clientNotes.retry']).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => byText(mEn['clientNotes.cancel']).click());
    expect(host!.querySelector('dialog')).not.toBeNull();
    await act(async () =>
      resolveRetry?.({
        status: 'ok',
        note: { ...note, body: 'retry body' },
      }),
    );
    await act(async () =>
      byText(mEn['clientNotes.exitWarning.discard']).click(),
    );

    expect(host!.querySelector('dialog')).toBeNull();
    expect(host!.querySelector('form textarea')).toBeNull();
    expect(host!.textContent).not.toContain(mEn['clientNotes.retry']);
    expect(host!.textContent).toContain('committed');
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

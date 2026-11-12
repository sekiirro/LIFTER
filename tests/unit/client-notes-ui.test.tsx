import { act, createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientNotes } from '../../components/client-notes/ClientNotes';
import { getMessages } from '../../lib/i18n';

describe('ClientNotes UI', () => {
  it('renders approved copy in EN', () => {
    const m = getMessages('en');
    const html = renderToStaticMarkup(
      createElement(ClientNotes, { locale: 'en', messages: m, status: 'ready', notes: [] }),
    );
    expect(html).toContain(m['clientNotes.tab']);
    expect(html).toContain(m['clientNotes.empty']);
    expect(html).toContain(m['clientNotes.create']);
    expect(html).not.toContain('Save Draft');
  });

  it('renders approved copy in AR with rtl', () => {
    const m = getMessages('ar');
    const html = renderToStaticMarkup(
      createElement(ClientNotes, { locale: 'ar', messages: m, status: 'ready', notes: [] }),
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain(m['clientNotes.tab']);
    expect(html).toContain(m['clientNotes.empty']);
  });

  it('renders loading state', () => {
    const m = getMessages('en');
    const html = renderToStaticMarkup(
      createElement(ClientNotes, { locale: 'en', messages: m, status: 'loading' }),
    );
    expect(html).toContain(m['clientNotes.loading']);
  });

  it('renders error state with retry', () => {
    const m = getMessages('en');
    const html = renderToStaticMarkup(
      createElement(ClientNotes, { locale: 'en', messages: m, status: 'error' }),
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
      createElement(ClientNotes, { locale: 'en', messages: m, status: 'ready', notes: [] }),
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

function setValue(element: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    (element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement
      : window.HTMLInputElement).prototype,
    'value',
  )?.set;
  setter?.call(element, value);
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
}

describe('ClientNotes behaviour', () => {
  let dom: JSDOM | undefined;
  let host: HTMLDivElement | undefined;
  let root: { render: (node: ReactNode) => void; unmount: () => void } | undefined;
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

  async function render(props: Record<string, unknown>) {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    });
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
      root?.render(createElement(ClientNotes, props as never));
    });
    return { dom, host: host!, root: root! };
  }

  it('create: first submit generates a key', async () => {
    const onCreate = vi.fn<(b: string, k: string) => Promise<{ status: string; }>>(async () => ({ status: 'ok' }));
    await render({ locale: 'en', messages: mEn, status: 'ready', notes: [], onCreate, canCreate: true });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'hello'));
    const submit = host!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await act(async () => {
      submit.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![0]).toBe('hello');
    expect(typeof onCreate.mock.calls[0]![1]).toBe('string');
  });

  it('create: retry after failed result re-sends same key and body', async () => {
    const onCreate = vi.fn<(b: string, k: string) => Promise<{ status: string; error?: string }>>(async () => ({ status: 'error', error: 'boom' }));
    await render({ locale: 'en', messages: mEn, status: 'ready', notes: [], onCreate, canCreate: true });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'hello'));
    const submit = host!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
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
  });

  it('create: after success a new key is used', async () => {
    const onCreate = vi.fn<(b: string, k: string) => Promise<{ status: string; }>>(async () => ({ status: 'ok' }));
    await render({ locale: 'en', messages: mEn, status: 'ready', notes: [], onCreate, canCreate: true });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'first'));
    const submit = host!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
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
    const onCreate = vi.fn<(b: string, k: string) => Promise<{ status: string; error?: string }>>(async () => ({ status: 'error', error: 'boom' }));
    await render({ locale: 'en', messages: mEn, status: 'ready', notes: [], onCreate, canCreate: true });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'hello'));
    const submit = host!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
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
    await render({ locale: 'en', messages: mEn, status: 'ready', notes: [], onCreate: vi.fn(), canCreate: true });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'unsaved'));
    const cancel = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === mEn['clientNotes.cancel'])!;
    await act(async () => cancel.click());
    expect(host!.textContent).toContain(mEn['clientNotes.exitWarning.title']);
    expect(host!.textContent).toContain(mEn['clientNotes.exitWarning.body']);
    const stay = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === mEn['clientNotes.exitWarning.stay'])!;
    await act(async () => stay.click());
    expect(host!.querySelector('[role="dialog"]')).toBeNull();
    expect((host!.querySelector('textarea') as HTMLTextAreaElement).value).toBe('unsaved');
    await act(async () => cancel.click());
    const discard = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === mEn['clientNotes.exitWarning.discard'])!;
    await act(async () => discard.click());
    expect(host!.querySelector('[role="dialog"]')).toBeNull();
    expect((host!.querySelector('textarea') as HTMLTextAreaElement)?.value ?? '').toBe('');
    expect(host!.textContent?.toLowerCase()).not.toContain('save draft');
  });

  it('exit protection: in-flight leaving shows row 34 body; Discard leaves without cancelling save', async () => {
    let resolveCreate: ((v: { status: string; error?: string }) => void) | undefined;
    const onCreate = vi.fn<(b: string, k: string) => Promise<{ status: string; error?: string }>>(() => new Promise<{ status: string; error?: string }>((resolve) => { resolveCreate = resolve; }));
    await render({ locale: 'en', messages: mEn, status: 'ready', notes: [], onCreate, canCreate: true });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'inflight'));
    const submit = host!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await act(async () => {
      submit.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const cancel = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === mEn['clientNotes.cancel'])!;
    await act(async () => cancel.click());
    expect(host!.textContent).toContain(mEn['clientNotes.exitWarning.bodyInFlight']);
    const discard = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === mEn['clientNotes.exitWarning.discard'])!;
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

  it('pending: submit disabled while saving', async () => {
    let resolveCreate: ((v: { status: string }) => void) | undefined;
    const onCreate = vi.fn<(b: string, k: string) => Promise<{ status: string; }>>(() => new Promise<{ status: string }>((resolve) => { resolveCreate = resolve; }));
    await render({ locale: 'en', messages: mEn, status: 'ready', notes: [], onCreate, canCreate: true });
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'pending'));
    const submit = host!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
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
    await render({ locale: 'en', messages: mEn, status: 'ready', notes: [], onCreate: vi.fn(), canCreate: true });
    expect(host!.textContent).toContain(mEn['clientNotes.empty']);
  });

  it('disabled create hides form when canCreate false', async () => {
    await render({ locale: 'en', messages: mEn, status: 'ready', notes: [], onCreate: vi.fn(), canCreate: false });
    expect(host!.querySelector('form')).toBeNull();
  });

  it('Bidi wraps mixed-direction text', async () => {
    const note = {
      id: 'n1', workspace_id: 'w', client_id: 'c', author_user_id: 'u1',
      body: 'Hello 123', created_at: '2026-11-08T10:15:00Z', edited_at: null,
    };
    await render({ locale: 'en', messages: mEn, status: 'ready', notes: [note], role: 'trainer', actorId: 'u1', canCreate: true });
    expect(host!.innerHTML).toContain('<bdi');
    expect(host!.textContent).toContain('Hello 123');
  });

  it('timestamps rendered in local time', async () => {
    const previousTimeZone = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    const note = {
      id: 'n1', workspace_id: 'w', client_id: 'c', author_user_id: 'u1',
      body: 'hello', created_at: '2026-11-08T10:15:00Z', edited_at: null,
    };
    try {
      await render({ locale: 'en', messages: mEn, status: 'ready', notes: [note], role: 'trainer', actorId: 'u1', canCreate: true });
      expect(host!.innerHTML).not.toContain('2026-11-08T10:15:00Z');
      expect(host!.textContent).toContain('Nov 8, 2026, 2:15 AM');
    } finally {
      if (previousTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimeZone;
    }
  });

  it('edit editor: unsaved exit protection keeps/clears text', async () => {
    const note = {
      id: 'n1', workspace_id: 'w', client_id: 'c', author_user_id: 'u1',
      body: 'hello', created_at: '2026-11-08T10:15:00Z', edited_at: null,
    };
    const onUpdate = vi.fn<(i: string, b: string) => Promise<{ status: string; error?: string }>>(async () => ({ status: 'error', error: 'boom' }));
    await render({ locale: 'en', messages: mEn, status: 'ready', notes: [note], role: 'trainer', actorId: 'u1', canCreate: true, onUpdate });
    const editBtn = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === mEn['clientNotes.edit'])!;
    await act(async () => editBtn.click());
    const cancel = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === mEn['clientNotes.cancel'])!;
    await act(async () => cancel.click());
    expect(host!.textContent).toContain(mEn['clientNotes.exitWarning.body']);
    const stay = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === mEn['clientNotes.exitWarning.stay'])!;
    await act(async () => stay.click());
    expect(host!.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => cancel.click());
    const discard = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === mEn['clientNotes.exitWarning.discard'])!;
    await act(async () => discard.click());
    expect(host!.querySelector('[role="dialog"]')).toBeNull();
  });

  it('edit editor: in-flight leaving shows row 34 and Discard does not cancel save', async () => {
    const note = {
      id: 'n1', workspace_id: 'w', client_id: 'c', author_user_id: 'u1',
      body: 'hello', created_at: '2026-11-08T10:15:00Z', edited_at: null,
    };
    let resolveUpdate: ((v: { status: string; error?: string }) => void) | undefined;
    const onUpdate = vi.fn<(i: string, b: string) => Promise<{ status: string; error?: string }>>(() => new Promise<{ status: string; error?: string }>((resolve) => { resolveUpdate = resolve; }));
    await render({ locale: 'en', messages: mEn, status: 'ready', notes: [note], role: 'trainer', actorId: 'u1', canCreate: true, onUpdate });
    const editBtn = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === mEn['clientNotes.edit'])!;
    await act(async () => editBtn.click());
    const textarea = host!.querySelector('textarea')!;
    await act(async () => setValue(textarea, 'changed'));
    const save = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === mEn['clientNotes.saveChanges'])!;
    await act(async () => {
      save.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const cancel = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === mEn['clientNotes.cancel'])!;
    await act(async () => cancel.click());
    expect(host!.textContent).toContain(mEn['clientNotes.exitWarning.bodyInFlight']);
    const discard = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === mEn['clientNotes.exitWarning.discard'])!;
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

  it('delete failures use approved generic copy only', async () => {
    const note = {
      id: 'n1', workspace_id: 'w', client_id: 'c', author_user_id: 'u1',
      body: 'hello', created_at: '2026-11-08T10:15:00Z', edited_at: null,
    };
    const onDelete = vi.fn(async () => ({ status: 'error', error: 'database secret' }));
    await render({ locale: 'en', messages: mEn, status: 'ready', notes: [note], role: 'platform_owner', actorId: 'po', onDelete });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteButton = Array.from(host!.querySelectorAll('button')).find((button) => button.textContent === mEn['clientNotes.delete'])!;
    await act(async () => {
      deleteButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onDelete).toHaveBeenCalledWith('n1');
    expect(host!.textContent).toContain(mEn['clientNotes.deleteError']);
    expect(host!.textContent).not.toContain('database secret');
  });
});

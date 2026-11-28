import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import type { Root } from 'react-dom/client';

vi.mock('server-only', () => ({}));
vi.mock('../../app/(app)/reports/actions', () => ({
  requestClientExport: vi.fn(),
  getClientExportStatus: vi.fn(),
}));

import {
  ExportSection,
  ExportStatusPanel,
} from '../../app/(app)/reports/ExportSection';
import {
  getClientExportStatus,
  requestClientExport,
} from '../../app/(app)/reports/actions';
import {
  buildExportArgs,
  exportDownloadHref,
  isTerminalExportStatus,
  mapServerExportState,
  type ExportStatus,
  type ExportViewState,
} from '../../lib/exports/contract';
import { getMessages } from '../../lib/i18n';

const workspaces = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Cairo' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'الإسكندرية' },
];

function panel(
  status: ExportViewState,
  locale: 'ar' | 'en' = 'en',
  jobId = 'job-1',
) {
  return renderToStaticMarkup(
    createElement(ExportStatusPanel, {
      status,
      jobId,
      messages: getMessages(locale),
      onRetry: () => {},
    }),
  );
}

function section(
  locale: 'ar' | 'en',
  canExport = true,
  initialScope: 'all' | 'workspace' = 'all',
) {
  return renderToStaticMarkup(
    createElement(ExportSection, {
      canExport,
      locale,
      workspaces,
      initialScope,
      messages: getMessages(locale),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('spec 030 export status mapping', () => {
  it('maps every safe server state to an approved UI status', () => {
    expect(mapServerExportState('accepted')).toBe('queued');
    expect(mapServerExportState('queued')).toBe('queued');
    expect(mapServerExportState('processing')).toBe('running');
    expect(mapServerExportState('running')).toBe('running');
    expect(mapServerExportState('ready')).toBe('ready');
    expect(mapServerExportState('failed')).toBe('failed');
    expect(mapServerExportState('expired')).toBe('expired');
  });

  it('fails closed for unknown, non-PO and malformed states', () => {
    for (const state of [
      'not_permitted',
      'unknown',
      '',
      null,
      1,
      {},
      undefined,
    ])
      expect(mapServerExportState(state)).toBeNull();
  });

  it('advances queued -> running -> ready and stops at terminal states', () => {
    const sequence = ['queued', 'processing', 'ready'].map(
      mapServerExportState,
    );
    expect(sequence).toEqual(['queued', 'running', 'ready']);
    expect(isTerminalExportStatus('queued')).toBe(false);
    expect(isTerminalExportStatus('running')).toBe(false);
    expect(isTerminalExportStatus('ready')).toBe(true);
    expect(isTerminalExportStatus('failed')).toBe(true);
    expect(isTerminalExportStatus('expired')).toBe(true);
  });
});

describe('spec 030 export status rendering', () => {
  it('renders queued and running with the approved preparing copy', () => {
    expect(panel('queued')).toContain('Queued');
    const running = panel('running');
    expect(running).toContain('Preparing your export');
    expect(running).toContain('aria-busy="true"');
    expect(running).not.toContain('Download export');
  });

  it('renders ready with an authenticated download action and expiry notice', () => {
    const ready = panel('ready');
    expect(ready).toContain('Ready');
    expect(ready).toContain('Download export');
    expect(ready).toContain('href="/api/reports/po-export/job-1"');
    expect(ready).toMatch(/<a[^>]*\sdownload(="")?[\s>]/);
    expect(ready).toContain('Download links expire shortly after generation');
    expect(ready).not.toContain('http');
    expect(ready).not.toContain('token');
  });

  it('renders failed, error and expired with retry, never a download', () => {
    for (const status of ['failed', 'error', 'expired'] as const) {
      const html = panel(status);
      expect(html).toContain('Retry');
      expect(html).not.toContain('Download export');
    }
    expect(panel('failed')).toContain(
      'Export couldn’t be prepared. Try again.',
    );
    expect(panel('expired')).toContain('Expired');
    expect(panel('error')).toContain('role="alert"');
  });

  it('renders the empty scope state', () => {
    expect(panel('empty')).toContain('No client data matches this scope');
    expect(panel('empty')).toContain('role="status"');
    expect(panel('empty')).not.toContain('Download export');
  });

  it('renders all states in Arabic RTL direction through approved keys', () => {
    expect(panel('running', 'ar')).toContain('بنجهز التصدير');
    expect(panel('ready', 'ar')).toContain('نزّل التصدير');
    expect(panel('ready', 'ar')).toContain(
      'روابط التنزيل بتنتهي صلاحيتها بعد وقت قصير',
    );
    expect(panel('failed', 'ar')).toContain('مقدرناش نجهز التصدير. حاول تاني.');
    expect(panel('expired', 'ar')).toContain('منتهي الصلاحية');
    expect(panel('empty', 'ar')).toContain(
      'مفيش بيانات عملاء مطابقة للنطاق ده',
    );
  });
});

describe('spec 030 export request scope and role gate', () => {
  it('sends scope only and never a field list or health notes', () => {
    const dummyKey = 'test-idempotency-key-12345';
    expect(buildExportArgs({ kind: 'all' }, dummyKey)).toEqual({
      p_workspace_id: null,
      p_idempotency_key: dummyKey,
    });
    expect(
      buildExportArgs(
        {
          kind: 'workspace',
          workspaceId: workspaces[0]!.id,
        },
        dummyKey,
      ),
    ).toEqual({
      p_workspace_id: workspaces[0]!.id,
      p_idempotency_key: dummyKey,
    });
    const payload = JSON.stringify(
      buildExportArgs({ kind: 'all' }, dummyKey),
    ).toLowerCase();
    expect(payload).not.toContain('health');
    expect(payload).not.toContain('field');
    expect(payload).not.toContain('note');
  });

  it('builds a same-origin authenticated download path only', () => {
    const href = exportDownloadHref('job/1?x=2');
    expect(href).toBe('/api/reports/po-export/job%2F1%3Fx%3D2');
    expect(href.startsWith('/')).toBe(true);
    expect(href).not.toContain('http');
  });

  it('hides the export section entirely for non-PO callers', () => {
    for (const locale of ['en', 'ar'] as const) {
      const html = section(locale, false);
      expect(html).toBe('');
      expect(html).not.toContain(getMessages(locale)['reports.export.title']);
    }
  });

  it('renders the PO-only export section on the existing Reports surface', () => {
    for (const locale of ['en', 'ar'] as const) {
      const m = getMessages(locale);
      const html = section(locale);
      expect(html).toContain(m['reports.export.title']);
      expect(html).toContain(m['reports.export.description']);
      expect(html).toContain(m['reports.export.scope.label']);
      expect(html).toContain(m['reports.export.confirmScope']);
      expect(html).toContain(m['reports.export.scope.all']);
      expect(html).toContain(m['reports.export.scope.workspace']);
      expect(html).toContain(m['reports.export.action']);
      expect(html).not.toContain('Download export');
    }
  });

  it('renders the selected-workspace selector with the approved workspace label', () => {
    const html = section('en', true, 'workspace');
    expect(html).toContain('Workspace');
    expect(html).toContain('Cairo');
    expect(html).toContain('value="' + workspaces[0]!.id + '"');
  });

  it('never renders or requests health notes in any state or locale', () => {
    const states: ExportStatus[] = [
      'queued',
      'running',
      'ready',
      'failed',
      'expired',
    ];
    for (const locale of ['en', 'ar'] as const) {
      for (const html of [
        ...states.map((status) => panel(status, locale)),
        panel('empty', locale),
        panel('error', locale),
        section(locale),
        section(locale, true, 'workspace'),
      ]) {
        expect(html.toLowerCase()).not.toContain('health');
        expect(html).not.toContain('ملاحظات صحية');
        expect(html).not.toContain('health_notes');
        expect(html).not.toContain('fitness_goals');
      }
    }
  });
});

describe('spec 030 interactive ExportSection behavior', () => {
  let dom: JSDOM;
  let container: HTMLElement;
  let root: Root;
  let globals: Map<string, PropertyDescriptor | undefined> | undefined;

  beforeEach(async () => {
    vi.useFakeTimers();
    dom = new JSDOM(
      '<!doctype html><html><body><div id="root"></div></body></html>',
      { url: 'http://localhost/' },
    );
    const currentGlobals: Record<string, unknown> = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      HTMLInputElement: dom.window.HTMLInputElement,
      HTMLSelectElement: dom.window.HTMLSelectElement,
      HTMLButtonElement: dom.window.HTMLButtonElement,
      HTMLAnchorElement: dom.window.HTMLAnchorElement,
      Event: dom.window.Event,
      MouseEvent: dom.window.MouseEvent,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    globals = new Map(
      Object.keys(currentGlobals).map((key) => [
        key,
        Object.getOwnPropertyDescriptor(globalThis, key),
      ]),
    );
    for (const [key, value] of Object.entries(currentGlobals)) {
      Object.defineProperty(globalThis, key, { configurable: true, value });
    }
    const { createRoot } = await import('react-dom/client');
    container = dom.window.document.getElementById('root') as HTMLElement;
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
    for (const [key, descriptor] of globals ?? []) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    vi.useRealTimers();
  });

  async function renderInteractive(
    locale: 'ar' | 'en' = 'en',
    canExport = true,
    initialScope: 'all' | 'workspace' = 'all',
  ) {
    await act(async () => {
      root.render(
        createElement(ExportSection, {
          canExport,
          locale,
          workspaces,
          initialScope,
          messages: getMessages(locale),
        }),
      );
    });
  }

  it('triggers export request on submit with valid idempotency key and displays queued status', async () => {
    vi.mocked(requestClientExport).mockResolvedValueOnce({
      status: 'queued',
      jobId: 'job-001',
    });

    await renderInteractive('en');

    const submitBtn = container.querySelector(
      '[data-testid="export-action"]',
    ) as HTMLButtonElement;
    expect(submitBtn).not.toBeNull();

    await act(async () => {
      submitBtn.click();
    });

    expect(requestClientExport).toHaveBeenCalledTimes(1);
    const firstCall = vi.mocked(requestClientExport).mock.calls[0];
    expect(firstCall).toBeDefined();
    const [scope, key] = firstCall!;
    expect(scope).toEqual({ kind: 'all' });
    expect(typeof key).toBe('string');
    expect(key).toMatch(/^[A-Za-z0-9_-]{16,96}$/);

    expect(container.textContent).toContain('Queued');
  });

  it('polls job status periodically and transitions from queued to running', async () => {
    vi.mocked(requestClientExport).mockResolvedValueOnce({
      status: 'queued',
      jobId: 'job-001',
    });
    vi.mocked(getClientExportStatus).mockResolvedValueOnce({
      status: 'running',
    });

    await renderInteractive('en');
    const submitBtn = container.querySelector(
      '[data-testid="export-action"]',
    ) as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    // Advance 2000ms for first poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(getClientExportStatus).toHaveBeenCalledWith('job-001');
    expect(container.textContent).toContain('Preparing your export');
    const busyPanel = container.querySelector('[aria-busy="true"]');
    expect(busyPanel).not.toBeNull();
  });

  it('transitions to ready, clears polling, and displays authenticated download link', async () => {
    vi.mocked(requestClientExport).mockResolvedValueOnce({
      status: 'queued',
      jobId: 'job-002',
    });
    vi.mocked(getClientExportStatus).mockResolvedValueOnce({
      status: 'ready',
    });

    await renderInteractive('en');
    const submitBtn = container.querySelector(
      '[data-testid="export-action"]',
    ) as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(container.textContent).toContain('Ready');
    const downloadLink = container.querySelector(
      '[data-testid="export-download"]',
    ) as HTMLAnchorElement;
    expect(downloadLink).not.toBeNull();
    expect(downloadLink.getAttribute('href')).toBe(
      '/api/reports/po-export/job-002',
    );
    expect(downloadLink.hasAttribute('download')).toBe(true);
    expect(downloadLink.textContent).toBe('Download export');

    // Verify polling stopped: advancing timer further does not call getClientExportStatus again
    vi.mocked(getClientExportStatus).mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(getClientExportStatus).not.toHaveBeenCalled();
  });

  it('shows error on failure and reuses the exact same idempotency key on retry', async () => {
    vi.mocked(requestClientExport).mockResolvedValueOnce({
      status: 'queued',
      jobId: 'job-003',
    });
    vi.mocked(getClientExportStatus).mockResolvedValueOnce({
      status: 'failed',
    });

    await renderInteractive('en');
    const submitBtn = container.querySelector(
      '[data-testid="export-action"]',
    ) as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(container.textContent).toContain(
      'Export couldn’t be prepared. Try again.',
    );
    const retryBtn = container.querySelector(
      '[data-testid="retry-button"]',
    ) as HTMLButtonElement;
    expect(retryBtn).not.toBeNull();

    // Mock the second request (the retry)
    vi.mocked(requestClientExport).mockResolvedValueOnce({
      status: 'queued',
      jobId: 'job-003-retry',
    });

    await act(async () => {
      retryBtn.click();
    });

    expect(requestClientExport).toHaveBeenCalledTimes(2);
    const firstCall = vi.mocked(requestClientExport).mock.calls[0];
    const secondCall = vi.mocked(requestClientExport).mock.calls[1];
    expect(firstCall).toBeDefined();
    expect(secondCall).toBeDefined();
    const firstCallKey = firstCall?.[1];
    const secondCallKey = secondCall?.[1];

    expect(firstCallKey).toBeDefined();
    expect(secondCallKey).toBeDefined();
    expect(secondCallKey).toBe(firstCallKey);
  });

  it('protects against duplicate in-flight requests on rapid double-click', async () => {
    let resolveFirst: ((val: unknown) => void) | undefined;
    const pendingPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(requestClientExport).mockReturnValueOnce(
      pendingPromise as ReturnType<typeof requestClientExport>,
    );

    await renderInteractive('en');
    const submitBtn = container.querySelector(
      '[data-testid="export-action"]',
    ) as HTMLButtonElement;

    await act(async () => {
      submitBtn.click();
      submitBtn.click();
    });

    expect(requestClientExport).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst?.({ status: 'queued', jobId: 'job-dc' });
    });
  });

  it('generates a new idempotency key after ready state', async () => {
    vi.mocked(requestClientExport).mockResolvedValueOnce({
      status: 'ready',
      jobId: 'job-004',
    });

    await renderInteractive('en');
    const submitBtn = container.querySelector(
      '[data-testid="export-action"]',
    ) as HTMLButtonElement;

    await act(async () => {
      submitBtn.click();
    });

    expect(requestClientExport).toHaveBeenCalledTimes(1);
    const call1 = vi.mocked(requestClientExport).mock.calls[0];
    expect(call1).toBeDefined();
    const key1 = call1?.[1];

    vi.mocked(requestClientExport).mockResolvedValueOnce({
      status: 'queued',
      jobId: 'job-005',
    });

    await act(async () => {
      submitBtn.click();
    });

    expect(requestClientExport).toHaveBeenCalledTimes(2);
    const call2 = vi.mocked(requestClientExport).mock.calls[1];
    expect(call2).toBeDefined();
    const key2 = call2?.[1];

    expect(key2).not.toBe(key1);
  });

  it('generates a new idempotency key when export scope changes', async () => {
    vi.mocked(requestClientExport).mockResolvedValueOnce({
      status: 'queued',
      jobId: 'job-006',
    });

    await renderInteractive('en');
    const submitBtn = container.querySelector(
      '[data-testid="export-action"]',
    ) as HTMLButtonElement;

    await act(async () => {
      submitBtn.click();
    });

    const call1 = vi.mocked(requestClientExport).mock.calls[0];
    expect(call1).toBeDefined();
    const key1 = call1?.[1];

    // Change scope to workspace
    const workspaceRadio = container.querySelector(
      'input[value="workspace"]',
    ) as HTMLInputElement;
    await act(async () => {
      workspaceRadio.click();
    });

    vi.mocked(requestClientExport).mockResolvedValueOnce({
      status: 'queued',
      jobId: 'job-007',
    });

    await act(async () => {
      submitBtn.click();
    });

    expect(requestClientExport).toHaveBeenCalledTimes(2);
    const call2 = vi.mocked(requestClientExport).mock.calls[1];
    expect(call2).toBeDefined();
    const key2 = call2?.[1];
    expect(key2).not.toBe(key1);
  });
});

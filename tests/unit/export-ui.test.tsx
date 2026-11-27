import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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
  buildExportScopeArgs,
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
    expect(ready).toContain('href="/api/exports/job-1/download"');
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
    expect(buildExportScopeArgs({ kind: 'all' })).toEqual({
      p_scope: 'all',
      p_workspace_id: null,
    });
    expect(
      buildExportScopeArgs({
        kind: 'workspace',
        workspaceId: workspaces[0]!.id,
      }),
    ).toEqual({ p_scope: 'workspace', p_workspace_id: workspaces[0]!.id });
    const payload = JSON.stringify(
      buildExportScopeArgs({ kind: 'all' }),
    ).toLowerCase();
    expect(payload).not.toContain('health');
    expect(payload).not.toContain('field');
    expect(payload).not.toContain('note');
  });

  it('builds a same-origin authenticated download path only', () => {
    const href = exportDownloadHref('job/1?x=2');
    expect(href).toBe('/api/exports/job%2F1%3Fx%3D2/download');
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

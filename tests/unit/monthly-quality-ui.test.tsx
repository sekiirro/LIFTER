import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  MonthlyQualityView,
  type MonthlyQualityViewProps,
} from '../../components/workforce/MonthlyQualityView';
import { ToastProvider } from '../../components/ui/Toast';
import { en } from '../../lib/i18n/messages/en';
import { ar } from '../../lib/i18n/messages/ar';
import type { MonthlyQualityRevision } from '../../lib/workforce/quality-server';

const workspaceId = '11111111-1111-1111-1111-111111111111';
const trainerId = '22222222-2222-2222-2222-222222222222';
const actorId = '55555555-5555-5555-5555-555555555555';

const feedback: MonthlyQualityRevision = {
  id: '33333333-3333-3333-3333-333333333333',
  workspace_id: workspaceId,
  trainer_id: trainerId,
  month: '2026-11',
  category: 'feedback',
  revision: 2,
  positive_count: 4,
  negative_count: 1,
  positive_weight: '1.00',
  negative_weight: '-1.00',
  net_points: '3.00',
  idempotency_key: '44444444-4444-4444-4444-444444444444',
  created_at: '2026-11-28T00:00:00Z',
  created_by: actorId,
};
const transformation: MonthlyQualityRevision = {
  ...feedback,
  id: '66666666-6666-6666-6666-666666666666',
  category: 'transformation',
  revision: 1,
  negative_count: 0,
  negative_weight: '0.00',
  net_points: '4.00',
};

function props(
  overrides: Partial<MonthlyQualityViewProps> = {},
): MonthlyQualityViewProps {
  return {
    locale: 'en',
    messages: en,
    workspaces: [{ id: workspaceId, name: 'Workspace A' }],
    trainers: [
      {
        staff_user_id: trainerId,
        role: 'trainer',
        display_name: 'Trainer A',
        points: '0.00',
        is_negative: false,
      },
    ],
    workspaceId,
    trainerId,
    month: '2026-11',
    effective: [feedback, transformation],
    revisions: [
      { ...feedback, id: 'earlier', revision: 1, positive_count: 2 },
      feedback,
      transformation,
    ],
    isClosed: false,
    status: 'ok',
    initialCategory: 'feedback',
    onSave: vi.fn().mockResolvedValue({ status: 'ok', data: feedback }),
    ...overrides,
  };
}

function render(viewProps: MonthlyQualityViewProps) {
  return renderToStaticMarkup(
    createElement(
      ToastProvider as unknown as (p: {
        dismissLabel: string;
        children?: unknown;
      }) => ReactElement,
      { dismissLabel: viewProps.messages['toast.dismiss'] },
      createElement(MonthlyQualityView, viewProps),
    ),
  );
}

describe('Monthly quality UI (T034 / FR-009 / FR-023)', () => {
  it('renders the EN feedback form, approved labels, history and LTR isolation', () => {
    const html = render(props());
    expect(html).toContain('lang="en"');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain(en['workforce.quality.title']);
    expect(html).toContain('Positive feedback count');
    expect(html).toContain('Negative feedback count');
    expect(html).toContain('Points per positive item');
    expect(html).toContain('Points per negative item');
    expect(html).toContain(en['workforce.quality.defaultHint']);
    expect(html).toContain(en['workforce.quality.revision.history']);
    expect(html).toContain(en['workforce.quality.revision.latestNote']);
    expect(html).toContain(en['workforce.quality.revision.effective']);
    expect(html).toContain(en['workforce.quality.revision.earlier']);
    expect(html).toContain(
      en['workforce.quality.revision.history.column.recordedAt'],
    );
    expect(html).toContain(en['workforce.report.ledger.column.actor']);
    expect(html).toContain(en['workforce.report.column.netPoints']);
    expect(html).toContain(en['workforce.quality.zeroConfirmTitle']);
    expect(html).toContain(en['workforce.quality.zeroConfirmBody']);
    expect(html).toContain('dir="ltr"');
    expect(html).not.toContain('Invalid decimal format');
  });

  it('renders the AR feedback form with exact S73-PO-5 labels and RTL', () => {
    const html = render(props({ locale: 'ar', messages: ar }));
    expect(html).toContain('lang="ar"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('جودة الخدمة الشهرية');
    expect(html).toContain('عدد الآراء الإيجابية');
    expect(html).toContain('عدد الآراء السلبية');
    expect(html).toContain('النقاط لكل حالة إيجابية');
    expect(html).toContain('النقاط لكل حالة سلبية');
    expect(html).toContain('آخر نسخة بس هي اللي بتتحسب.');
    expect(html).toContain('اتسجلت في');
  });

  it('omits negative fields for transformation and disables finalized months', () => {
    const transformationHtml = render(
      props({
        initialCategory: 'transformation',
        effective: [transformation],
        revisions: [transformation],
      }),
    );
    expect(transformationHtml).toContain('Count');
    expect(transformationHtml).toContain('Points per item');
    expect(transformationHtml).not.toContain('Negative feedback count');
    expect(transformationHtml).not.toContain('Points per negative item');

    const closedHtml = render(props({ isClosed: true }));
    expect(closedHtml).toContain(en['workforce.finalize.alreadyFinalized']);
    expect(closedHtml).toMatch(/<button[^>]*disabled=""/);
  });

  it('renders distinct generic empty and error states with retry', () => {
    expect(
      render(props({ status: 'empty', workspaces: [], trainers: [] })),
    ).toContain(en['states.empty.title']);
    const errorHtml = render(props({ status: 'error' }));
    expect(errorHtml).toContain(en['states.error.title']);
    expect(errorHtml).toContain(en['states.retry']);
  });
});

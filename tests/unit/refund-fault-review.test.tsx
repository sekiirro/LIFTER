// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../app/(app)/workforce/report/refund-fault-actions', () => ({
  listOpenRefundFaultReviewsAction: vi.fn(),
  resolveRefundFaultReviewAction: vi.fn(),
}));

import {
  listOpenRefundFaultReviewsAction,
  resolveRefundFaultReviewAction,
} from '../../app/(app)/workforce/report/refund-fault-actions';
import { RefundFaultReviewPanel } from '../../components/workforce/RefundFaultReviewPanel';
import { getMessages } from '../../lib/i18n';
import { formatCairoDateTime } from '../../lib/i18n/format';
import type { StaffTotal } from '../../lib/workforce/report-types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const workspaceId = '11111111-1111-1111-1111-111111111111';
const review = {
  review_id: '22222222-2222-2222-2222-222222222222',
  acquisition_key: 'acquisition-opaque-key',
  purchase_id: '33333333-3333-3333-3333-333333333333',
  opened_at: '2026-11-27T10:00:00Z',
};
const staff: StaffTotal[] = [
  {
    staff_user_id: '44444444-4444-4444-4444-444444444444',
    role: 'trainer',
    display_name: 'Trainer One',
    points: '0.00',
    is_negative: false,
  },
];

let root: Root | undefined;
let host: HTMLDivElement | undefined;

async function render(locale: 'en' | 'ar' = 'en') {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      createElement(RefundFaultReviewPanel, {
        workspaceId,
        locale,
        messages: getMessages(locale),
        staff,
      }),
    );
  });
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.clearAllMocks();
});

describe('refund-fault review panel', () => {
  it.each([
    ['en', 'Full refund — staff fault?', 'Select workspace Trainers or Sales'],
    [
      'ar',
      'استرداد كامل — فيه خطأ من الفريق؟',
      'اختار المدرّبين أو المبيعات في مساحة العمل',
    ],
  ] as const)(
    'lists open reviews with approved %s copy',
    async (locale, title, staffLabel) => {
      vi.mocked(listOpenRefundFaultReviewsAction).mockResolvedValue({
        status: 'ok',
        reviews: [review],
      });
      await render(locale);
      await settle();

      expect(host?.textContent).toContain(title);
      const yes = [
        ...(host?.querySelectorAll('input[type="radio"]') ?? []),
      ].find((input) =>
        input.parentElement?.textContent?.includes(
          getMessages(locale)['workforce.report.refund.faultYes'],
        ),
      ) as HTMLInputElement;
      await act(async () => yes.click());
      expect(host?.textContent).toContain(staffLabel);
      expect(host?.textContent).toContain(review.purchase_id);
      expect(host?.querySelector('section')?.getAttribute('dir')).toBe(
        locale === 'ar' ? 'rtl' : 'ltr',
      );
      expect(host?.querySelector('button')?.textContent).toContain(
        getMessages(locale)['dialog.confirm'],
      );
    },
  );

  it('isolates the purchase id LTR and formats opened_at in Cairo time in AR', async () => {
    vi.mocked(listOpenRefundFaultReviewsAction).mockResolvedValue({
      status: 'ok',
      reviews: [review],
    });
    await render('ar');
    await settle();

    expect(host?.querySelector('section')?.getAttribute('dir')).toBe('rtl');
    const isolatedId = host?.querySelector('legend bdi[dir="ltr"]');
    expect(isolatedId?.textContent).toBe(review.purchase_id);
    expect(host?.textContent).toContain(
      formatCairoDateTime(review.opened_at, 'ar'),
    );
    expect(host?.textContent).not.toContain(review.opened_at);
  });

  it('keeps the EN opened_at formatting and copy unchanged', async () => {
    vi.mocked(listOpenRefundFaultReviewsAction).mockResolvedValue({
      status: 'ok',
      reviews: [review],
    });
    await render('en');
    await settle();

    expect(host?.textContent).toContain(
      getMessages('en')['workforce.report.refund.questionTitle'],
    );
    expect(host?.textContent).toContain('Nov 27, 2026, 12:00');
    expect(host?.textContent).not.toContain(review.opened_at);
    expect(host?.querySelector('legend bdi[dir="ltr"]')?.textContent).toBe(
      review.purchase_id,
    );
  });

  it.each(['en', 'ar'] as const)(
    'renders the approved empty refund queue in %s',
    async (locale) => {
      vi.mocked(listOpenRefundFaultReviewsAction).mockResolvedValue({
        status: 'ok',
        reviews: [],
      });
      await render(locale);
      await settle();
      expect(host?.textContent).toContain(
        getMessages(locale)['workforce.report.refund.emptyQueue'],
      );
    },
  );

  it('renders retryable error and denied states', async () => {
    vi.mocked(listOpenRefundFaultReviewsAction)
      .mockResolvedValueOnce({ status: 'error' })
      .mockResolvedValueOnce({ status: 'denied' });
    await render();
    await settle();
    expect(host?.textContent).toContain(
      getMessages('en')['workforce.report.loadError'],
    );
    expect(host?.textContent).toContain(getMessages('en')['states.retry']);

    await act(async () => {
      host?.querySelector('button')?.click();
      await Promise.resolve();
    });
    await settle();
    expect(host?.textContent).toContain(
      getMessages('en')['workforce.report.denied'],
    );
  });

  it.each([
    ['2.5', '-2.50'],
    ['99999999.99', '-99999999.99'],
  ] as const)(
    'requires a PO decision and resolves deduction %s exactly',
    async (amountValue, expectedPoints) => {
      vi.mocked(listOpenRefundFaultReviewsAction).mockResolvedValue({
        status: 'ok',
        reviews: [review],
      });
      vi.mocked(resolveRefundFaultReviewAction).mockResolvedValue({
        status: 'ok',
      });
      vi.stubGlobal('crypto', {
        randomUUID: () => '55555555-5555-5555-5555-555555555555',
      });
      await render();
      await settle();

      const submit = () => host?.querySelector('button')?.click();
      expect(host?.querySelector('button')?.hasAttribute('disabled')).toBe(
        true,
      );

      const yes = [
        ...(host?.querySelectorAll('input[type="radio"]') ?? []),
      ].find((input) =>
        input.parentElement?.textContent?.includes('Yes'),
      ) as HTMLInputElement;
      await act(async () => {
        yes.click();
      });
      const checkbox = host?.querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement;
      await act(async () => {
        checkbox.click();
      });
      const amount = host?.querySelector(
        'input[type="number"]',
      ) as HTMLInputElement;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(amount, amountValue);
        amount.dispatchEvent(new Event('input', { bubbles: true }));
        amount.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await settle();
      await act(async () => {
        submit();
        await Promise.resolve();
      });

      expect(resolveRefundFaultReviewAction).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          reviewId: review.review_id,
          staffFault: true,
          staffDeductions: [
            { staffUserId: staff[0]!.staff_user_id, points: expectedPoints },
          ],
        }),
      );
      expect(host?.textContent).toContain(
        getMessages('en')['workforce.report.refund.saved'],
      );
      expect(host?.textContent).not.toContain(review.purchase_id);
    },
  );
});

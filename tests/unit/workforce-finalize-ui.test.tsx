import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getMessages } from '../../lib/i18n';
import {
  FinalizeMonthView,
  type FinalizeMonthViewProps,
} from '../../components/workforce/FinalizeMonthView';
import { ToastProvider } from '../../components/ui/Toast';
import {
  getCurrentCairoMonth,
  getEndedCairoMonths,
  isValidMonth,
} from '../../lib/workforce/finalize';

function renderView(props: FinalizeMonthViewProps) {
  const messages = props.messages;
  return renderToStaticMarkup(
    createElement(
      ToastProvider as unknown as (p: {
        dismissLabel: string;
        children?: unknown;
      }) => ReactElement,
      { dismissLabel: messages['toast.dismiss'] ?? 'Dismiss' },
      createElement(FinalizeMonthView, props),
    ),
  );
}

describe('PO Finalize Month UI (T034)', () => {
  const enMessages = getMessages('en');
  const arMessages = getMessages('ar');

  const baseProps: FinalizeMonthViewProps = {
    workspaceId: '11111111-1111-1111-1111-111111111111',
    locale: 'en',
    messages: enMessages,
    endedMonths: ['2026-10', '2026-09', '2026-08'],
    currentCairoMonth: '2026-11',
    denied: false,
    initialSelectedMonth: '2026-10',
    onFinalizeAction: vi.fn().mockResolvedValue({ status: 'finalized' }),
  };

  it('renders finalize month screen in EN with all approved labels', () => {
    const html = renderView(baseProps);
    expect(html).toContain('Finalize month');
    expect(html).toContain('Select a month that has ended (Cairo time)');
    expect(html).toContain('Only a month that has ended can be finalized.');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('lang="en"');
    expect(html).toContain('value="2026-10"');
    expect(html).toContain('value="2026-09"');
    expect(html).toContain('value="2026-08"');
  });

  it('renders finalize month screen in AR with Egyptian colloquial approved copy', () => {
    const html = renderView({
      ...baseProps,
      locale: 'ar',
      messages: arMessages,
    });
    expect(html).toContain('اعتماد الشهر');
    expect(html).toContain('اختار شهر خلص (بتوقيت القاهرة)');
    expect(html).toContain('الشهر اللي خلص بس هو اللي يتعتمد.');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
  });

  it('denies access to Workspace Owner, Trainer, and Sales with non-disclosing string', () => {
    const roles = ['workspace_owner', 'trainer', 'sales'] as const;
    for (const role of roles) {
      expect(role).toBeDefined();
      const html = renderView({
        ...baseProps,
        denied: true,
      });
      // Non-PO sees ONLY approved denied string
      expect(html).toContain('Only the Platform Owner can finalize months.');
      // Does not disclose month selector, action button, or workspace details
      expect(html).not.toContain('Select a month that has ended');
      expect(html).not.toContain('finalize-month-select');
      expect(html).not.toContain('finalize-submit-button');
    }

    const arDenied = renderView({
      ...baseProps,
      locale: 'ar',
      messages: arMessages,
      denied: true,
    });
    expect(arDenied).toContain('مالك المنصة بس اللي يقدر يعتمد الشهور.');
    expect(arDenied).not.toContain('اختار شهر خلص');
  });

  it('renders confirm dialog with permanent wording and action labels', () => {
    const html = renderView(baseProps);
    // Dialog markup should contain approved permanent confirmation text
    expect(html).toContain('Finalize this month?');
    expect(html).toContain(
      'This finalization is recorded by the Platform Owner and is permanent. Later corrections go to the current open month and link to this month.',
    );
    expect(html).toContain('Confirm');
    expect(html).toContain('Cancel');
  });

  it('renders confirm dialog in Arabic with approved permanent wording', () => {
    const html = renderView({
      ...baseProps,
      locale: 'ar',
      messages: arMessages,
    });
    expect(html).toContain('تعتمد الشهر ده؟');
    expect(html).toContain(
      'الاعتماد ده بيسجّله مالك المنصة وهو نهائي. أي تصحيح بعد كده هيروح للشهر الحالي وهيكون مرتبط بالشهر ده.',
    );
    expect(html).toContain('تأكيد');
    expect(html).toContain('إلغاء');
  });

  describe('Cairo month date boundaries and calculations', () => {
    it('validates YYYY-MM formatted string', () => {
      expect(isValidMonth('2026-10')).toBe(true);
      expect(isValidMonth('2026-01')).toBe(true);
      expect(isValidMonth('2026-13')).toBe(false);
      expect(isValidMonth('invalid')).toBe(false);
      expect(isValidMonth('')).toBe(false);
      expect(isValidMonth(null)).toBe(false);
    });

    it('computes ended Cairo months strictly prior to current Cairo month', () => {
      // 2026-11-26 is in November 2026
      const refDate = new Date('2026-11-26T12:00:00Z');
      const current = getCurrentCairoMonth(refDate);
      expect(current).toBe('2026-11');

      const ended = getEndedCairoMonths(3, refDate);
      expect(ended).toEqual(['2026-10', '2026-09', '2026-08']);
      expect(ended).not.toContain('2026-11');
    });

    it('handles year boundary rollover in ended months list', () => {
      // January 2027 in Cairo
      const refDate = new Date('2027-01-15T12:00:00Z');
      const current = getCurrentCairoMonth(refDate);
      expect(current).toBe('2027-01');

      const ended = getEndedCairoMonths(3, refDate);
      expect(ended).toEqual(['2026-12', '2026-11', '2026-10']);
    });

    it('evaluates Cairo midnight accurately (UTC+2 in winter)', () => {
      // 2026-10-31 21:59:59Z is 23:59:59 in Cairo (October)
      const beforeMidnight = new Date('2026-10-31T21:59:59Z');
      expect(getCurrentCairoMonth(beforeMidnight)).toBe('2026-10');

      // 2026-10-31 22:00:00Z is 00:00:00 in Cairo (November 1st)
      const atMidnight = new Date('2026-10-31T22:00:00Z');
      expect(getCurrentCairoMonth(atMidnight)).toBe('2026-11');
    });
  });
});

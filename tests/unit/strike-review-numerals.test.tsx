import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StrikeReviewView } from '../../components/workforce/StrikeReviewView';
import { getMessages } from '../../lib/i18n';
import type { StrikeTrainerSummary } from '../../lib/workforce/strikes';
import { ToastProvider } from '../../components/ui/Toast';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const localizedTrainers: StrikeTrainerSummary[] = [
  {
    userId: 'trainer-2',
    displayName: 'Coach Tariq',
    count: 7,
    reviewThreshold: 3,
    strikes: [
      {
        strikeId: 'strike-2',
        breachAt: '2026-11-27T10:00:00.000Z',
        trainerUserId: 'trainer-2',
        voided: false,
        eligibleTrainers: [],
        corrections: [],
      },
    ],
  },
];

function renderLocalized(locale: 'en' | 'ar') {
  const messages = getMessages(locale);
  return renderToStaticMarkup(
    createElement(
      ToastProvider as unknown as (props: {
        dismissLabel: string;
        children?: ReactElement;
      }) => ReactElement,
      { dismissLabel: messages['toast.dismiss'] },
      createElement(StrikeReviewView, {
        locale,
        messages,
        workspaceId: 'workspace-1',
        trainers: localizedTrainers,
        status: 'ok',
        onCorrect: vi.fn(),
      }),
    ),
  );
}

describe('strike review numeral localization', () => {
  it('renders Arabic-locale digits for count and threshold in AR', () => {
    const html = renderLocalized('ar');
    const formattedCount = new Intl.NumberFormat('ar-u-nu-arab').format(7);
    const formattedThreshold = new Intl.NumberFormat('ar-u-nu-arab').format(3);
    expect(html).toContain(`<bdi dir="ltr">${formattedCount}</bdi>`);
    expect(html).toContain(formattedThreshold);
  });

  it('leaves EN digits unchanged', () => {
    const html = renderLocalized('en');
    expect(html).toContain('<bdi dir="ltr">7</bdi>');
  });
});

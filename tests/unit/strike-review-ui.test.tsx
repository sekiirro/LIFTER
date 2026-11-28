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

const reasonCodes = [
  'client_caused_delay',
  'system_issue',
  'wrong_trainer',
  'duplicate',
  'po_exception',
] as const;

const approvedReasons = {
  en: [
    'Delay caused by the client',
    'System or technical issue',
    'Strike recorded for the wrong Trainer',
    'Duplicate strike',
    'Approved exception by the Platform Owner',
  ],
  ar: [
    'التأخير كان من العميل',
    'مشكلة في السيستم',
    'التأخير اتسجل على مدرب غلط',
    'تأخير متسجل مرتين',
    'استثناء من مالك المنصة',
  ],
} as const;

const trainers: StrikeTrainerSummary[] = [
  {
    userId: 'trainer-1',
    displayName: 'Coach Samira',
    count: 1,
    reviewThreshold: 0,
    strikes: [
      {
        strikeId: 'strike-1',
        breachAt: '2026-11-27T10:00:00.000Z',
        trainerUserId: 'trainer-1',
        voided: false,
        eligibleTrainers: [],
        corrections: reasonCodes.map((reasonCode, index) => ({
          action: (index % 3 === 0
            ? 'void'
            : index % 3 === 1
              ? 'reinstate'
              : 'reattribute') as 'void' | 'reinstate' | 'reattribute',
          reasonCode,
          actorDisplayName: 'Platform Owner',
          createdAt: `2026-11-27T10:0${index}:00.000Z`,
        })),
      },
    ],
  },
];

function renderReview(locale: 'en' | 'ar') {
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
        trainers,
        status: 'ok',
        onCorrect: vi.fn(),
      }),
    ),
  );
}

describe('strike correction history UI', () => {
  it('renders the approved EN history columns, values, and five fixed reasons', () => {
    const messages = getMessages('en');
    const labels = reasonCodes.map(
      (code) => messages[`workforce.strike.correction.reason.${code}`],
    );
    expect(labels).toEqual(approvedReasons.en);
    labels.forEach((label, index) => {
      expect(Buffer.from(label)).toEqual(
        Buffer.from(approvedReasons.en[index]!),
      );
    });

    const html = renderReview('en');
    expect(html).toContain('lang="en"');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('Correction history');
    expect(html).toContain('Recorded by');
    expect(html).toContain('2026');
    expect(html).toContain('Platform Owner');
    approvedReasons.en.forEach((label) => expect(html).toContain(label));
  });

  it('renders the approved AR history columns, values, and five byte-exact reasons', () => {
    const messages = getMessages('ar');
    const labels = reasonCodes.map(
      (code) => messages[`workforce.strike.correction.reason.${code}`],
    );
    expect(labels).toEqual(approvedReasons.ar);
    labels.forEach((label, index) => {
      expect(Buffer.from(label, 'utf8')).toEqual(
        Buffer.from(approvedReasons.ar[index]!, 'utf8'),
      );
    });

    const html = renderReview('ar');
    expect(html).toContain('lang="ar"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('سجل التصحيحات');
    expect(html).toContain('سجّله');
    expect(html).toContain('Platform Owner');
    approvedReasons.ar.forEach((label) => expect(html).toContain(label));
  });
});

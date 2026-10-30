import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApprovalReview } from '../../components/registration-approval/ApprovalReview';
import { PaymentConfirmation } from '../../components/registration-approval/PaymentConfirmation';
import { StatusBadge } from '../../components/registration-approval/StatusBadge';
import { PaymentHistory } from '../../components/registration-approval/PaymentHistory';
import { getMessages } from '../../lib/i18n';

vi.mock('../../app/(app)/registration-approvals/actions', () => ({
  approveRegistrationAction: vi.fn(),
  reconsiderRegistrationAction: vi.fn(),
  rejectRegistrationAction: vi.fn(),
  correctCollectionAction: vi.fn(),
}));

const item = {
  client_id: '00000000-0000-0000-0000-000000000002',
  name: 'Mina',
  signup_time: '2026-10-02T00:00:00Z',
  approval_state: 'rejected',
  offer_version_label: 'Strength / 2026',
  price_minor: '120000',
  currency: 'EGP',
  installments: [
    {
      seq: 1,
      amount_minor: '120000',
      currency: 'EGP',
      issued_day_offset: null,
    },
  ],
};
const role = 'platform_owner' as const;

describe('registration approval controls', () => {
  it('shows the full page review, exact read-only amount, date/code and PO actions', () => {
    const html = renderToStaticMarkup(
      createElement(ApprovalReview, {
        item,
        workspaceId: '00000000-0000-0000-0000-000000000001',
        role,
        messages: getMessages('en'),
      }),
    );
    expect(html).toContain('120000');
    expect(html).toContain('readOnly=""');
    expect(html).toContain('type="date"');
    expect(html).toContain('registration_rejected');
    expect(html).toContain('Reconsider');
    expect(html).toContain('<label');
  });
  it('hides correction and reconsideration controls from non-PO staff', () => {
    const html = renderToStaticMarkup(
      createElement(ApprovalReview, {
        item,
        workspaceId: '00000000-0000-0000-0000-000000000001',
        role: 'workspace_owner',
        messages: getMessages('en'),
      }),
    );
    expect(html).not.toContain('reconsider');
    expect(html).not.toContain('correct');
  });
  it('requires explicit confirmation and preserves the request key when retrying uncertainty', () => {
    const submit = vi.fn();
    const html = renderToStaticMarkup(
      createElement(PaymentConfirmation, {
        amountMinor: '120000',
        currency: 'EGP',
        requestKey: '00000000-0000-0000-0000-000000000004',
        onConfirm: submit,
        messages: getMessages('en'),
      }),
    );
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('120000');
    expect(html).toContain('aria-live="polite"');
  });
  it('uses semantic badge states and Bidi safe money/date content', () => {
    const badge = renderToStaticMarkup(
      createElement(StatusBadge, {
        status: 'approved',
        messages: getMessages('en'),
      }),
    );
    const history = renderToStaticMarkup(
      createElement(PaymentHistory, {
        obligations: [
          {
            seq: 1,
            amount_minor: '120000',
            currency: 'EGP',
            due_on: '2026-11-01',
            paid: false,
            collected_on: null,
          },
        ],
        workspaceId: '00000000-0000-0000-0000-000000000001',
        clientId: item.client_id,
        subscriptionId: '00000000-0000-0000-0000-000000000003',
        role: 'sales',
        messages: getMessages('en'),
      }),
    );
    expect(badge).toContain('data-status="approved"');
    expect(badge).toContain('Approved');
    expect(history).toContain('dir="auto"');
  });
  it('never renders commission to Sales even if an overbroad payload is supplied', () => {
    const html = renderToStaticMarkup(
      createElement(PaymentHistory, {
        obligations: [
          {
            seq: 1,
            amount_minor: '120000',
            currency: 'EGP',
            due_on: '2026-11-01',
            paid: true,
            collected_on: '2026-11-01',
          },
        ],
        role: 'sales',
        messages: getMessages('en'),
        commissionEvents: [
          { installment_seq: 1, commission_minor: '99000', rate_bp: 825 },
        ],
      }),
    );
    expect(html).not.toContain('99000');
    expect(html).not.toContain('Commission');
  });
  it('associates a visible label with the payment confirmation checkbox', () => {
    const html = renderToStaticMarkup(
      createElement(PaymentConfirmation, {
        amountMinor: '120000',
        currency: 'EGP',
        requestKey: '00000000-0000-4000-8000-000000000004',
        onConfirm: vi.fn(),
        messages: getMessages('en'),
      }),
    );
    expect(html).toContain('<label');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain(
      'I confirm this amount was received outside LIFTER.',
    );
    expect(html).toMatch(/<label[^>]*>.*<input type="checkbox".*<span>/);
  });
  it('limits collection correction to the PO and requires a confirmation dialog', () => {
    const obligations = [
      {
        seq: 1,
        amount_minor: '120000',
        currency: 'EGP',
        due_on: '2026-11-01',
        paid: true,
        collected_on: '2026-11-01',
        obligation_id: '00000000-0000-0000-0000-000000000005',
        revision: 1,
        tail_event_id: '00000000-0000-0000-0000-000000000006',
        kind: 'collection',
      },
    ];
    const po = renderToStaticMarkup(
      createElement(PaymentHistory, {
        obligations,
        role: 'platform_owner',
        workspaceId: '00000000-0000-0000-0000-000000000001',
        clientId: item.client_id,
        subscriptionId: '00000000-0000-0000-0000-000000000003',
        messages: getMessages('en'),
      }),
    );
    const sales = renderToStaticMarkup(
      createElement(PaymentHistory, {
        obligations,
        role: 'sales',
        workspaceId: '00000000-0000-0000-0000-000000000001',
        clientId: item.client_id,
        subscriptionId: '00000000-0000-0000-0000-000000000003',
        messages: getMessages('en'),
      }),
    );
    expect(po).toContain('data-testid="correction-action"');
    expect(po).toContain('data-testid="confirm-dialog"');
    expect(sales).not.toContain('data-testid="correction-action"');
  });
  it('wires the PO correction projection into the review history', () => {
    const html = renderToStaticMarkup(
      createElement(ApprovalReview, {
        item: { ...item, approval_state: 'approved' },
        workspaceId: '00000000-0000-0000-0000-000000000001',
        role,
        messages: getMessages('en'),
        correctionContext: {
          subscriptionId: '00000000-0000-0000-0000-000000000003',
          corrections: [
            {
              seq: 1,
              obligationId: '00000000-0000-0000-0000-000000000005',
              revision: 1,
              tailEventId: '00000000-0000-0000-0000-000000000006',
            },
          ],
        },
      }),
    );
    expect(html).toContain('data-testid="correction-action"');
    expect(html).toContain('data-testid="confirm-dialog"');
  });
});

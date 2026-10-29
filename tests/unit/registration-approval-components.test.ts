import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApprovalReview } from '../../components/registration-approval/ApprovalReview';
import { PaymentConfirmation } from '../../components/registration-approval/PaymentConfirmation';
import { StatusBadge } from '../../components/registration-approval/StatusBadge';
import { PaymentHistory } from '../../components/registration-approval/PaymentHistory';
import { getMessages } from '../../lib/i18n';

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
    expect(html).toContain('readonly');
    expect(html).toContain('type="date"');
    expect(html).toContain('registration_rejected');
    expect(html).toContain('reconsider');
    expect(html).toContain('correct');
    expect(html).toContain('aria-label=');
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
            revision: 0,
            tail_event_id: null,
            kind: null,
            collected_on: null,
            effective_on: null,
            recorded_by: null,
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
    expect(history).toContain('dir="auto"');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from '../../app/(app)/registration-approvals/page';
import Review from '../../app/(app)/registration-approvals/[clientId]/page';
import PaymentPage from '../../app/(app)/payments/page';
import PaymentDetail from '../../app/(app)/payments/[subscriptionId]/page';
import Loading from '../../app/(app)/registration-approvals/loading';
import ErrorPage from '../../app/(app)/registration-approvals/error';

const mock = vi.hoisted(() => ({
  actor: vi.fn(),
  cookies: vi.fn(),
  session: vi.fn(),
  notFound: vi.fn(),
  approvalQueue: vi.fn(),
  approvalReview: vi.fn(),
  paymentQueue: vi.fn(),
  paymentStatus: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ requireActor: mock.actor }));
vi.mock('next/headers', () => ({ cookies: mock.cookies }));
vi.mock('next/navigation', () => ({ notFound: mock.notFound }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mock.session,
}));
vi.mock('../../lib/registration-approval/read', () => ({
  readRegistrationApprovalQueue: mock.approvalQueue,
  readRegistrationApprovalReview: mock.approvalReview,
  readWorkspacePaymentQueue: mock.paymentQueue,
  readSubscriptionPaymentStatus: mock.paymentStatus,
}));
vi.mock('../../components/registration-approval/ApprovalQueue', () => ({
  ApprovalQueue: (props: { items: unknown[] }) =>
    createElement(
      'div',
      { 'data-testid': 'approval-queue' },
      JSON.stringify(props.items),
    ),
}));
vi.mock('../../components/registration-approval/ApprovalReview', () => ({
  ApprovalReview: (props: { item: unknown }) =>
    createElement(
      'div',
      { 'data-testid': 'approval-review' },
      JSON.stringify(props.item),
    ),
}));
vi.mock('../../components/registration-approval/PaymentQueue', () => ({
  PaymentQueue: (props: { items: unknown[] }) =>
    createElement(
      'div',
      { 'data-testid': 'payment-queue' },
      JSON.stringify(props.items),
    ),
}));
vi.mock('../../components/registration-approval/PaymentHistory', () => ({
  PaymentHistory: (props: { obligations: unknown[] }) =>
    createElement(
      'div',
      { 'data-testid': 'payment-history' },
      JSON.stringify(props.obligations),
    ),
}));
import { getMessages } from '../../lib/i18n';

const workspace = '00000000-0000-0000-0000-000000000001';
const client = '00000000-0000-0000-0000-000000000002';
const subscription = '00000000-0000-0000-0000-000000000003';
const pending = {
  status: 'ok',
  items: [
    { client_id: client, name: 'Mina', price_minor: '120000', currency: 'EGP' },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  mock.actor.mockResolvedValue({
    userId: client,
    role: 'platform_owner',
    activeWorkspaceIds: [],
  });
  mock.cookies.mockResolvedValue({ get: () => ({ value: 'en' }) });
  mock.notFound.mockImplementation(() => {
    throw new Error('404');
  });
  mock.session.mockResolvedValue({
    from: () => ({
      select: () => ({
        order: () => ({
          in: async () => ({
            data: [{ id: workspace, name: 'Studio' }],
            error: null,
          }),
          then: (
            resolve: (value: {
              data: { id: string; name: string }[];
              error: null;
            }) => void,
          ) =>
            resolve({ data: [{ id: workspace, name: 'Studio' }], error: null }),
        }),
      }),
    }),
  });
  mock.approvalQueue.mockResolvedValue(pending);
  mock.approvalReview.mockResolvedValue({
    status: 'ok',
    item: {
      ...pending.items[0],
      installments: [{ seq: 1, amount_minor: '120000', currency: 'EGP' }],
    },
  });
  mock.paymentQueue.mockResolvedValue({ status: 'ok', items: [] });
  mock.paymentStatus.mockResolvedValue({ status: 'ok', obligations: [] });
});

describe('registration approval and payment pages', () => {
  it('renders scoped queue and full review with read-only exact amount and explicit confirmation', async () => {
    const queue = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ workspace }) }),
    );
    expect(queue).toContain('data-testid="approval-queue"');
    expect(mock.approvalQueue).toHaveBeenCalledWith({ workspaceId: workspace });
    const review = renderToStaticMarkup(
      await Review({
        params: Promise.resolve({ clientId: client }),
        searchParams: Promise.resolve({ workspace }),
      }),
    );
    expect(review).toContain('data-testid="approval-review"');
    expect(review).toContain('120000');
  });
  it.each(['sales', 'trainer', null])(
    'denies %s from approval queue before loading',
    async (role) => {
      mock.actor.mockResolvedValue({
        userId: client,
        role,
        activeWorkspaceIds: [workspace],
      });
      await expect(
        Page({ searchParams: Promise.resolve({ workspace }) }),
      ).rejects.toThrow('404');
      expect(mock.approvalQueue).not.toHaveBeenCalled();
    },
  );
  it('allows Sales payment list/detail while denying approval review', async () => {
    mock.actor.mockResolvedValue({
      userId: client,
      role: 'sales',
      activeWorkspaceIds: [workspace],
    });
    expect(
      renderToStaticMarkup(
        await PaymentPage({ searchParams: Promise.resolve({ workspace }) }),
      ),
    ).toContain('data-testid="payment-queue"');
    expect(
      renderToStaticMarkup(
        await PaymentDetail({
          params: Promise.resolve({ subscriptionId: subscription }),
          searchParams: Promise.resolve({ workspace, client }),
        }),
      ),
    ).toContain('data-testid="payment-history"');
    await expect(
      Review({
        params: Promise.resolve({ clientId: client }),
        searchParams: Promise.resolve({ workspace }),
      }),
    ).rejects.toThrow('404');
    expect(mock.approvalReview).not.toHaveBeenCalled();
  });
  it('shows safe localized stale/network states and loading/error shells', async () => {
    mock.approvalQueue.mockResolvedValue({ status: 'unavailable' });
    const queue = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ workspace }) }),
    );
    expect(queue).toContain(
      getMessages('en')['registrationApproval.unavailable'],
    );
    expect(queue).not.toContain('manager');
    expect(renderToStaticMarkup(await Loading())).toContain('role="status"');
    const error = renderToStaticMarkup(
      createElement(ErrorPage, {
        reset: vi.fn(),
        error: new Error('private backend detail'),
      }),
    );
    expect(error).toContain('role="alert"');
    expect(error).not.toContain('private backend detail');
  });
});

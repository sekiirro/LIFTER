import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import type { Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkforceReportView } from '../../components/workforce/WorkforceReportView';
import { getMessages } from '../../lib/i18n';
import type {
  PointAdjustmentInput,
  PointActionResult,
  ReattributePointInput,
} from '../../lib/workforce/manual-points';
import type { WorkforceReportData } from '../../lib/workforce/report-types';

vi.mock('../../app/(app)/workforce/report/refund-fault-actions', () => ({
  listOpenRefundFaultReviewsAction: vi.fn().mockResolvedValue({
    status: 'ok',
    reviews: [],
  }),
  resolveRefundFaultReviewAction: vi.fn().mockResolvedValue({ status: 'ok' }),
}));

const workspaceId = '00000000-0000-4000-8000-000000000001';
const trainerId = '11111111-1111-4000-8000-111111111111';
const salesId = '22222222-2222-4000-8000-222222222222';

const report: WorkforceReportData = {
  workspace_id: workspaceId,
  month: '2026-11-01',
  status: 'current',
  is_closed: false,
  snapshot: null,
  totals: [
    {
      staff_user_id: trainerId,
      role: 'trainer',
      display_name: 'Aleksandra Wiśniewska-Kowalczyk',
      points: '-99999999.99',
      is_negative: true,
    },
    {
      staff_user_id: salesId,
      role: 'sales',
      display_name: 'نور الهدى عبد الرحمن',
      points: '3.00',
      is_negative: false,
    },
  ],
  trainers: [
    {
      staff_user_id: trainerId,
      role: 'trainer',
      display_name: 'Aleksandra Wiśniewska-Kowalczyk',
      points: '-99999999.99',
      is_negative: true,
    },
  ],
  sales: [
    {
      staff_user_id: salesId,
      role: 'sales',
      display_name: 'نور الهدى عبد الرحمن',
      points: '3.00',
      is_negative: false,
    },
  ],
  ledger: [
    {
      id: '33333333-3333-4000-8000-333333333333',
      staff_user_id: trainerId,
      staff_role: 'trainer',
      staff_name: 'Aleksandra Wiśniewska-Kowalczyk',
      category: 'earned',
      points: '1.00',
      effective_month: '2026-11-01',
      original_month: '2026-11-01',
      actor: null,
      recorded_at: '2026-11-05T12:00:00Z',
      reason_code: 'p7-activation-v1',
      reason: null,
      operation: null,
      original_entry_id: null,
      original_entry_kind: null,
    },
  ],
};

type PostAction = (input: PointAdjustmentInput) => Promise<PointActionResult>;
type ReattributeAction = (
  input: ReattributePointInput,
) => Promise<PointActionResult>;

let dom: JSDOM;
let host: HTMLDivElement;
let root: Root;
let previousGlobals: Map<string, PropertyDescriptor | undefined>;

async function installDom() {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
  });
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  dom.window.HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
  Object.defineProperty(dom.window.HTMLElement.prototype, 'attachEvent', {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'detachEvent', {
    configurable: true,
    value: () => undefined,
  });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLDialogElement: dom.window.HTMLDialogElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    HTMLSelectElement: dom.window.HTMLSelectElement,
    Event: dom.window.Event,
    FormData: dom.window.FormData,
    MouseEvent: dom.window.MouseEvent,
    Node: dom.window.Node,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  previousGlobals = new Map(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  host = document.createElement('div');
  document.body.append(host);
  const { createRoot } = await import('react-dom/client');
  root = createRoot(host);
}

function restoreDom() {
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  dom.window.close();
}

async function renderView({
  locale = 'en',
  post,
  reattribute,
}: {
  locale?: 'en' | 'ar';
  post?: PostAction;
  reattribute?: ReattributeAction;
} = {}) {
  await act(async () => {
    root.render(
      createElement(WorkforceReportView, {
        report,
        status: 'ok',
        locale,
        messages: getMessages(locale),
        currentMonth: '2026-11',
        postPointAdjustment: post,
        reattributePointEntry: reattribute,
      }),
    );
  });
}

async function setValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  const prototype =
    element instanceof dom.window.HTMLTextAreaElement
      ? dom.window.HTMLTextAreaElement.prototype
      : element instanceof dom.window.HTMLSelectElement
        ? dom.window.HTMLSelectElement.prototype
        : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  const tracker = (
    element as HTMLInputElement & {
      _valueTracker?: { setValue: (value: string) => void };
    }
  )._valueTracker;
  tracker?.setValue('');
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function byTestId(id: string): HTMLElement {
  const element = host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!element) throw new Error(`Missing data-testid=${id}`);
  return element;
}

beforeEach(installDom);
afterEach(async () => {
  await act(async () => root.unmount());
  restoreDom();
});

describe('T013 PO manual points UI', () => {
  it('ships the approved CB-02 point copy byte-exact in EN and AR', () => {
    expect(getMessages('en')).toMatchObject({
      'workforce.report.points.add': 'Add points',
      'workforce.report.points.deduct': 'Deduct points',
      'workforce.report.points.correct': 'Correct points',
      'workforce.report.points.reattribute': 'Reattribute points',
      'workforce.report.points.reasonRequired': 'A reason is required.',
      'workforce.report.points.reasonHint':
        'Manual point edits are PO-only and recorded with a reason. They never change salary.',
      'workforce.report.points.confirmTitle': 'Confirm point change?',
      'workforce.report.points.confirmBody':
        'This records a manual, PO-only point change with your reason. It does not change salary.',
      'workforce.report.points.saved': 'Point change recorded.',
      'workforce.report.points.error':
        'Could not record the point change. Try again.',
      'workforce.report.points.stale':
        'A newer revision exists. Reload before saving.',
      'workforce.report.refund.selectStaff':
        'Select workspace Trainers or Sales',
    });
    expect(getMessages('ar')).toMatchObject({
      'workforce.report.points.add': 'ضيف نقاط',
      'workforce.report.points.deduct': 'خصم نقاط',
      'workforce.report.points.correct': 'صحّح النقاط',
      'workforce.report.points.reattribute': 'انقل النقاط لشخص تاني',
      'workforce.report.points.reasonRequired': 'لازم تكتب السبب.',
      'workforce.report.points.reasonHint':
        'تعديل النقاط باليد مقفول على مالك المنصة وبيتحفظ مع السبب. مش بيغيّر المرتب.',
      'workforce.report.points.confirmTitle': 'تأكيد تعديل النقاط؟',
      'workforce.report.points.confirmBody':
        'ده تسجيل تعديل نقاط باليد من مالك المنصة مع السبب اللي كتبته. مش بيغيّر المرتب.',
      'workforce.report.points.saved': 'اتسجل تعديل النقاط.',
      'workforce.report.points.error': 'مقدرناش نسجّل تعديل النقاط. حاول تاني.',
      'workforce.report.points.stale': 'فيه نسخة أحدث. حدّث قبل الحفظ.',
      'workforce.report.refund.selectStaff':
        'اختار المدرّبين أو المبيعات في مساحة العمل',
    });
  });

  it.each([
    [
      'en',
      'Add points',
      'Deduct points',
      'Correct points',
      'Reattribute points',
    ],
    ['ar', 'ضيف نقاط', 'خصم نقاط', 'صحّح النقاط', 'انقل النقاط لشخص تاني'],
  ] as const)(
    'renders only the approved %s operation labels',
    (locale, add, deduct, correct, reattribute) => {
      const html = renderToStaticMarkup(
        createElement(WorkforceReportView, {
          report,
          status: 'ok',
          locale,
          messages: getMessages(locale),
          currentMonth: '2026-11',
        }),
      );
      for (const label of [add, deduct, correct, reattribute]) {
        expect(html).toContain(label);
      }
      expect(html).not.toContain('Correct strike');
      expect(html).not.toContain('صحّح تأخير الخطة');
    },
  );

  it.each([
    ['en', 'Correct points', 'Earned'],
    ['ar', 'صحّح النقاط', 'المكتسبة'],
  ] as const)(
    'renders manual reason and approved lineage labels in %s',
    (locale, operationLabel, originalKindLabel) => {
      const manualEntry = {
        ...report.ledger[0]!,
        id: '44444444-4444-4000-8000-444444444444',
        reason_code: 'manual_adjustment',
        reason: 'تم تصحيح النقاط بعد مراجعة السجل',
        actor: 'Nour Ahmed',
        operation: 'correct',
        original_entry_id: '55555555-5555-4000-8000-555555555555',
        original_entry_kind: 'earned',
      } as unknown as WorkforceReportData['ledger'][number];
      const html = renderToStaticMarkup(
        createElement(WorkforceReportView, {
          report: { ...report, ledger: [...report.ledger, manualEntry] },
          status: 'ok',
          locale,
          messages: getMessages(locale),
          currentMonth: '2026-11',
        }),
      );

      expect(html).toContain(
        '<bdi dir="auto">تم تصحيح النقاط بعد مراجعة السجل</bdi>',
      );
      expect(html).toContain(operationLabel);
      expect(html).toContain(originalKindLabel);
      expect(html).toContain('55555555-5555-4000-8000-555555555555');
      expect(html).toContain('Nour Ahmed');
      expect(html).toContain('<bdi dir="ltr">p7-activation-v1</bdi>');
    },
  );

  it.each([
    [
      'en',
      'Negative total',
      'Negative totals are valid. They do not change salary.',
    ],
    ['ar', 'إجمالي سالب', 'الإجمالي السالب مقبول. مش بيغيّر المرتب.'],
  ] as const)(
    'renders a large negative signed total correctly in %s',
    (locale, badge, hint) => {
      const html = renderToStaticMarkup(
        createElement(WorkforceReportView, {
          report,
          status: 'ok',
          locale,
          messages: getMessages(locale),
          currentMonth: '2026-11',
        }),
      );
      expect(html).toContain('<bdi dir="ltr">-99999999.99</bdi>');
      expect(html).toContain(badge);
      expect(html).toContain(hint);
    },
  );

  it('disables every point action when trusted handlers are unavailable', async () => {
    await renderView();
    for (const id of [
      `points-add-${trainerId}`,
      `points-deduct-${trainerId}`,
      'points-correct-33333333-3333-4000-8000-333333333333',
      'points-reattribute-33333333-3333-4000-8000-333333333333',
    ]) {
      expect((byTestId(id) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it.each([
    [
      'en',
      'A reason is required.',
      'Manual point edits are PO-only and recorded with a reason. They never change salary.',
    ],
    [
      'ar',
      'لازم تكتب السبب.',
      'تعديل النقاط باليد مقفول على مالك المنصة وبيتحفظ مع السبب. مش بيغيّر المرتب.',
    ],
  ] as const)(
    'uses byte-exact approved reason copy in %s',
    async (locale, required, hint) => {
      const post = vi.fn<PostAction>(async () => ({ status: 'ok' }));
      await renderView({ locale, post });
      await click(byTestId(`points-add-${trainerId}`));
      expect(host.textContent).toContain(hint);
      expect(
        host.querySelector<HTMLTextAreaElement>('textarea[name="reason"]')
          ?.maxLength,
      ).toBe(500);
      await click(byTestId('dialog-confirm'));
      expect(post).not.toHaveBeenCalled();
      expect(byTestId('points-reason-error').textContent).toContain(required);
      expect(
        host
          .querySelector<HTMLTextAreaElement>('textarea[name="reason"]')
          ?.getAttribute('aria-invalid'),
      ).toBe('true');
    },
  );

  it('shows pending, blocks duplicate submits, then shows approved success', async () => {
    let resolve!: (result: PointActionResult) => void;
    const post = vi.fn<PostAction>(
      () => new Promise((done) => (resolve = done)),
    );
    await renderView({ post });
    await click(byTestId(`points-add-${trainerId}`));
    await setValue(host.querySelector('input[name="points"]')!, '2.5');
    await setValue(
      host.querySelector<HTMLTextAreaElement>('textarea[name="reason"]')!,
      '  Approved manual point change  ',
    );

    const confirm = byTestId('dialog-confirm') as HTMLButtonElement;
    await act(async () => {
      confirm.click();
      confirm.click();
      await new Promise((done) => setTimeout(done, 0));
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[0]).toMatchObject({
      workspaceId,
      staffUserId: trainerId,
      operation: 'add',
      points: '2.5',
      effectiveMonth: '2026-11',
      reason: '  Approved manual point change  ',
      idempotencyKey: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    });
    const pendingConfirm = byTestId('dialog-confirm') as HTMLButtonElement;
    expect(pendingConfirm.disabled).toBe(false);
    expect(pendingConfirm.getAttribute('aria-disabled')).toBe('true');
    expect(pendingConfirm.getAttribute('aria-busy')).toBe('true');
    expect((byTestId('dialog-cancel') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      host.querySelector<HTMLInputElement>('input[name="points"]')?.disabled,
    ).toBe(true);
    expect(
      host.querySelector<HTMLTextAreaElement>('textarea[name="reason"]')
        ?.disabled,
    ).toBe(true);

    await act(async () => resolve({ status: 'ok' }));
    expect(host.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
    expect(byTestId('points-success').textContent).toContain(
      'Point change recorded.',
    );
  });

  it('keeps edits and the same retry key after an error, then shows success', async () => {
    const post = vi
      .fn<PostAction>()
      .mockResolvedValueOnce({ status: 'invalid_input' })
      .mockResolvedValueOnce({ status: 'ok' });
    await renderView({ post });
    await click(byTestId(`points-deduct-${trainerId}`));
    await setValue(host.querySelector('input[name="points"]')!, '0.75');
    const reason = host.querySelector<HTMLTextAreaElement>(
      'textarea[name="reason"]',
    )!;
    await setValue(reason, 'Approved deduction');
    await click(byTestId('dialog-confirm'));

    expect(byTestId('points-action-error').textContent).toContain(
      'Could not record the point change. Try again.',
    );
    expect(reason.value).toBe('Approved deduction');
    expect(host.querySelector('[data-testid="confirm-dialog"]')).not.toBeNull();

    await click(byTestId('dialog-confirm'));
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1]?.[0].idempotencyKey).toBe(
      post.mock.calls[0]?.[0].idempotencyKey,
    );
    expect(byTestId('points-success').textContent).toContain(
      'Point change recorded.',
    );
  });

  it('corrects an immutable earned entry with signed scale-2 input', async () => {
    const post = vi.fn<PostAction>(async () => ({ status: 'ok' }));
    await renderView({ post });
    await click(
      byTestId('points-correct-33333333-3333-4000-8000-333333333333'),
    );
    await setValue(host.querySelector('input[name="points"]')!, '-0.25');
    await setValue(
      host.querySelector<HTMLTextAreaElement>('textarea[name="reason"]')!,
      'Correct the earned amount',
    );
    await click(byTestId('dialog-confirm'));

    expect(post).toHaveBeenCalledWith({
      workspaceId,
      staffUserId: trainerId,
      operation: 'correct',
      points: '-0.25',
      effectiveMonth: null,
      originalEntryKind: 'earned',
      originalEntryId: '33333333-3333-4000-8000-333333333333',
      reason: 'Correct the earned amount',
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    });
  });

  it('reattributes an immutable ledger entry to another staff member', async () => {
    const reattribute = vi.fn<ReattributeAction>(async () => ({
      status: 'ok',
    }));
    await renderView({ reattribute });
    await click(
      byTestId('points-reattribute-33333333-3333-4000-8000-333333333333'),
    );
    expect(host.querySelector('input[name="points"]')).toBeNull();
    await setValue(
      host.querySelector('select[name="targetStaffUserId"]')!,
      salesId,
    );
    await setValue(
      host.querySelector<HTMLTextAreaElement>('textarea[name="reason"]')!,
      'Correct the responsible employee',
    );
    await click(byTestId('dialog-confirm'));

    expect(reattribute).toHaveBeenCalledWith({
      workspaceId,
      originalEntryKind: 'earned',
      originalEntryId: '33333333-3333-4000-8000-333333333333',
      targetStaffUserId: salesId,
      reason: 'Correct the responsible employee',
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    });
    expect(byTestId('points-success').textContent).toContain(
      'Point change recorded.',
    );
  });
});

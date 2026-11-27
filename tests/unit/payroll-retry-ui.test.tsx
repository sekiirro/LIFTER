/** @vitest-environment happy-dom */
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayrollManager } from '../../components/payroll/PayrollManager';
import { ToastProvider } from '../../components/ui/Toast';
import { en } from '../../lib/i18n/messages/en';

const actions = vi.hoisted(() => ({
  setSalary: vi.fn(),
  postInput: vi.fn(),
  createSnapshot: vi.fn(),
  approve: vi.fn(),
}));

vi.mock('../../app/(app)/payroll/actions', () => ({
  setBasicSalaryAction: actions.setSalary,
  postMonetaryPayrollInputAction: actions.postInput,
  createPayrollSnapshotAction: actions.createSnapshot,
  approveExternalPayrollAction: actions.approve,
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  actions.postInput.mockResolvedValue({ status: 'ok', id: 'input-1' });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function renderManager() {
  await act(async () => {
    root.render(
      createElement(
        ToastProvider as unknown as (props: {
          dismissLabel: string;
          children?: unknown;
        }) => ReactElement,
        { dismissLabel: en['dialog.cancel'] },
        createElement(PayrollManager, {
          locale: 'en',
          messages: en,
          initialEmployees: [
            {
              userId: '00000000-0000-0000-0000-000000000001',
              role: 'trainer',
            },
          ],
          initialMonth: '2026-11',
        }),
      ),
    );
  });
}

async function setInputAmount(value: string) {
  const input = host.querySelector<HTMLInputElement>('#payroll-input-amount');
  if (!input) throw new Error('Missing payroll input amount');
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submitManualInput() {
  const form = host.querySelectorAll('form')[1];
  if (!form) throw new Error('Missing manual payroll input form');
  await act(async () => {
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
}

describe('Payroll manual-input retry identity', () => {
  it('reuses one intent token across a lost-response retry and rotates it after success', async () => {
    actions.postInput
      .mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValueOnce({ status: 'ok', id: 'input-1' })
      .mockResolvedValueOnce({ status: 'ok', id: 'input-2' });
    await renderManager();
    await setInputAmount('25.50');

    await submitManualInput();
    await submitManualInput();

    expect(actions.postInput).toHaveBeenCalledTimes(2);
    const first = actions.postInput.mock.calls[0]?.[0];
    const retry = actions.postInput.mock.calls[1]?.[0];
    expect(first).toMatchObject({
      employeeId: '00000000-0000-0000-0000-000000000001',
      effectiveMonth: '2026-11-01',
      category: 'incentive',
      amount: '25.50',
      currency: 'EGP',
    });
    expect(first.reasonRef).toMatch(/^[0-9a-f-]{36}$/i);
    expect(first.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(retry.reasonRef).toBe(first.reasonRef);
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);

    await setInputAmount('25.50');
    await submitManualInput();
    const nextIntent = actions.postInput.mock.calls[2]?.[0];
    expect(nextIntent.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(nextIntent.reasonRef).not.toBe(first.reasonRef);

    const correction = host.querySelector<HTMLInputElement>(
      'input[name="payroll-category"][value="correction"]',
    );
    await act(async () => correction?.click());
    expect(
      host.querySelector<HTMLSelectElement>('#payroll-supersedes-id')?.value,
    ).toBe('');
    expect(
      [
        ...host.querySelectorAll<HTMLOptionElement>(
          '#payroll-supersedes-id option',
        ),
      ].some((option) => option.value === 'input-2'),
    ).toBe(true);
  });
});

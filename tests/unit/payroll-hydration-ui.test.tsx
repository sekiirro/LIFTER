/** @vitest-environment happy-dom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayrollManager } from '../../components/payroll/PayrollManager';
import { ToastProvider } from '../../components/ui/Toast';
import { en } from '../../lib/i18n/messages/en';

const actions = vi.hoisted(() => ({
  loadMonth: vi.fn(),
  setSalary: vi.fn(),
  postInput: vi.fn(),
  createSnapshot: vi.fn(),
  approve: vi.fn(),
}));

vi.mock('../../app/(app)/payroll/actions', () => ({
  getPayrollMonthAction: actions.loadMonth,
  setBasicSalaryAction: actions.setSalary,
  postMonetaryPayrollInputAction: actions.postInput,
  createPayrollSnapshotAction: actions.createSnapshot,
  approveExternalPayrollAction: actions.approve,
}));

const employeeA = '00000000-0000-0000-0000-000000000001';
const employeeB = '00000000-0000-0000-0000-000000000002';
const employeeC = '00000000-0000-0000-0000-000000000003';

const hydratedMonth = {
  salary: {
    id: 'salary-1',
    revision: 1,
    amountMinor: '100000',
    currency: 'USD',
    market: 'International',
  },
  inputs: [
    {
      id: 'input-1',
      category: 'incentive',
      amountMinor: '2500',
      currency: 'USD',
    },
  ],
  snapshot: {
    id: 'snap-2',
    version: 2,
    amountMinor: '102500',
    currency: 'USD',
  },
  approval: {
    id: 'approval-1',
    snapshotId: 'snap-2',
    snapshotVersion: 2,
    amountMinor: '102500',
    currency: 'USD',
  },
};

const emptyMonth = {
  salary: null,
  inputs: [],
  snapshot: null,
  approval: null,
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  actions.loadMonth.mockResolvedValue({ status: 'ok', data: emptyMonth });
  actions.setSalary.mockResolvedValue({
    status: 'ok',
    data: {
      id: 'salary-1',
      revision: 2,
      amount_minor: '100000',
      currency: 'USD',
    },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function renderManager(initialPayrollMonth = hydratedMonth) {
  await act(async () => {
    root.render(
      createElement(
        ToastProvider,
        { dismissLabel: en['dialog.cancel'] },
        createElement(PayrollManager, {
          locale: 'en',
          messages: en,
          initialEmployees: [
            { userId: employeeA, role: 'trainer' },
            { userId: employeeB, role: 'sales' },
            { userId: employeeC, role: 'trainer' },
          ],
          initialMonth: '2026-11',
          initialPayrollMonth,
        }),
      ),
    );
  });
}

function inputValue(selector: string) {
  return host.querySelector<HTMLInputElement | HTMLSelectElement>(selector)
    ?.value;
}

async function changeValue(selector: string, value: string) {
  const element = host.querySelector<HTMLInputElement | HTMLSelectElement>(
    selector,
  );
  if (!element) throw new Error(`Missing ${selector}`);
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function submitSalary() {
  const form = host.querySelector('form');
  if (!form) throw new Error('Missing salary form');
  await act(async () => {
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
}

describe('Payroll month hydration and scope reset', () => {
  it('hydrates salary revision, currency, saved inputs and approval state', async () => {
    await renderManager();

    expect(inputValue('#salary-market-select')).toBe('International');
    expect(inputValue('#salary-currency-select')).toBe('USD');
    expect(inputValue('#salary-amount-input')).toBe('1000.00');
    expect(host.textContent).toContain('1025.00 USD');
    expect(host.querySelector('[data-testid="snapshot-details"]')).toBeTruthy();
    expect(
      host.querySelector<HTMLButtonElement>(
        '[data-testid="approve-payroll-btn"]',
      )?.disabled,
    ).toBe(true);

    const correction = host.querySelector<HTMLInputElement>(
      'input[name="payroll-category"][value="correction"]',
    );
    await act(async () => correction?.click());
    expect(
      host.querySelector<HTMLSelectElement>('#payroll-supersedes-id')?.value,
    ).toBe('');
    expect(host.textContent).toContain('input-1');

    await submitSalary();
    expect(actions.setSalary).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: employeeA,
        effectiveMonth: '2026-11-01',
        expectedRevision: 1,
        currency: 'USD',
        amount: '1000.00',
      }),
    );
  });

  it('clears stale scope state immediately and ignores an older loader response', async () => {
    let resolveB!: (value: unknown) => void;
    actions.loadMonth.mockImplementation(
      ({ employeeId }: { employeeId: string }) => {
        if (employeeId === employeeB) {
          return new Promise((resolve) => {
            resolveB = resolve;
          });
        }
        return Promise.resolve({
          status: 'ok',
          data: {
            salary: {
              id: 'salary-3',
              revision: 3,
              amountMinor: '400000',
              currency: 'SAR',
              market: 'International',
            },
            inputs: [],
            snapshot: null,
            approval: null,
          },
        });
      },
    );
    await renderManager();

    await changeValue('#payroll-employee-select', employeeB);
    expect(inputValue('#salary-currency-select')).toBe('EGP');
    expect(inputValue('#salary-amount-input')).toBe('');
    expect(host.querySelector('[data-testid="snapshot-details"]')).toBeNull();

    await changeValue('#payroll-employee-select', employeeC);
    expect(inputValue('#salary-currency-select')).toBe('SAR');
    expect(inputValue('#salary-amount-input')).toBe('4000.00');

    await act(async () => {
      resolveB({ status: 'ok', data: emptyMonth });
    });
    expect(inputValue('#salary-currency-select')).toBe('SAR');
    expect(inputValue('#salary-amount-input')).toBe('4000.00');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setBasicSalary,
  postMonetaryPayrollInput,
  createPayrollSnapshot,
  approveExternalPayroll,
  getEligibleEmployees,
  getPayrollMonth,
} from '../../lib/workforce/payroll';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ getActor: mocks.actor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.client,
}));

describe('Payroll Service & RPC Action Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.mockResolvedValue({
      rpc: mocks.rpc,
      from: mocks.from,
    });
  });

  describe('Authorization: Platform Owner vs WO / Trainer / Sales', () => {
    it.each([['workspace_owner'], ['trainer'], ['sales'], [null]])(
      'denies access when actor is %s',
      async (role) => {
        mocks.actor.mockResolvedValue(
          role ? { userId: 'user-1', role, activeWorkspaceIds: [] } : null,
        );

        expect(await getEligibleEmployees()).toEqual({ status: 'denied' });
        expect(
          await setBasicSalary({
            employeeId: 'emp-1',
            effectiveMonth: '2026-11',
            market: 'Egypt',
            amount: '1000',
            currency: 'EGP',
            expectedRevision: 0,
          }),
        ).toEqual({ status: 'denied' });
        expect(
          await postMonetaryPayrollInput({
            employeeId: 'emp-1',
            effectiveMonth: '2026-11',
            category: 'incentive',
            amount: '500',
            currency: 'EGP',
          }),
        ).toEqual({ status: 'denied' });
        expect(
          await createPayrollSnapshot({
            employeeId: 'emp-1',
            effectiveMonth: '2026-11',
          }),
        ).toEqual({ status: 'denied' });
        expect(
          await approveExternalPayroll({
            employeeId: 'emp-1',
            effectiveMonth: '2026-11',
            snapshotId: 'snap-1',
            snapshotVersion: 1,
            amountMinor: '150000',
            currency: 'EGP',
          }),
        ).toEqual({ status: 'denied' });
      },
    );
  });

  describe('Eligible Employees', () => {
    it('returns eligible staff (trainers and sales) for platform owner', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'po-1',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      });
      mocks.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              { user_id: 'trainer-1', role: 'trainer' },
              { user_id: 'sales-1', role: 'sales' },
            ],
            error: null,
          }),
        }),
      });

      const result = await getEligibleEmployees();
      expect(result).toEqual({
        status: 'ok',
        employees: [
          { userId: 'trainer-1', role: 'trainer' },
          { userId: 'sales-1', role: 'sales' },
        ],
      });
    });
  });

  describe('getPayrollMonth', () => {
    it('loads and shapes the PO-only salary, inputs, snapshot and approval state', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'po-1',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      });
      mocks.rpc.mockResolvedValue({
        data: {
          salary: {
            id: 'salary-1',
            revision: 1,
            amount_minor: '100000',
            currency: 'USD',
            market: 'International',
          },
          inputs: [
            {
              id: 'input-1',
              category: 'correction',
              amount_minor: '2500',
              currency: 'USD',
            },
          ],
          snapshot: {
            id: 'snap-1',
            version: 2,
            amount_minor: '102500',
            currency: 'USD',
          },
          approval: null,
        },
        error: null,
      });

      const result = await getPayrollMonth({
        employeeId: 'emp-1',
        effectiveMonth: '2026-11',
      });

      expect(mocks.rpc).toHaveBeenCalledWith('p7_get_payroll_month', {
        p_employee_id: 'emp-1',
        p_effective_month: '2026-11-01',
      });
      expect(result).toEqual({
        status: 'ok',
        data: {
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
              category: 'correction',
              amountMinor: '2500',
              currency: 'USD',
            },
          ],
          snapshot: {
            id: 'snap-1',
            version: 2,
            amountMinor: '102500',
            currency: 'USD',
          },
          approval: null,
        },
      });
    });

    it('denies non-PO callers before loading payroll state', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'trainer-1',
        role: 'trainer',
        activeWorkspaceIds: ['ws-1'],
      });

      expect(
        await getPayrollMonth({
          employeeId: 'emp-1',
          effectiveMonth: '2026-11',
        }),
      ).toEqual({ status: 'denied' });
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('rejects an invalid month before loading payroll state', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'po-1',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      });

      expect(
        await getPayrollMonth({
          employeeId: 'emp-1',
          effectiveMonth: '2026-13',
        }),
      ).toEqual({ status: 'invalid_input' });
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
  });

  describe('setBasicSalary', () => {
    it('successfully calls p7_set_basic_salary for PO', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'po-1',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      });
      mocks.rpc.mockResolvedValue({
        data: {
          id: 'salary-1',
          revision: 1,
          amount_minor: '500000',
          currency: 'EGP',
        },
        error: null,
      });

      const result = await setBasicSalary({
        employeeId: 'emp-1',
        effectiveMonth: '2026-11',
        market: 'Egypt',
        amount: '5000.00',
        currency: 'EGP',
        expectedRevision: 0,
      });

      expect(mocks.rpc).toHaveBeenCalledWith(
        'p7_set_basic_salary',
        expect.objectContaining({
          p_employee_id: 'emp-1',
          p_effective_month: '2026-11-01',
          p_market: 'Egypt',
          p_amount_minor: '500000',
          p_currency: 'EGP',
          p_expected_revision: 0,
        }),
      );
      expect(result).toEqual({
        status: 'ok',
        data: {
          id: 'salary-1',
          revision: 1,
          amount_minor: '500000',
          currency: 'EGP',
        },
      });
    });

    it('rejects invalid currency for market before RPC', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'po-1',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      });

      const result = await setBasicSalary({
        employeeId: 'emp-1',
        effectiveMonth: '2026-11',
        market: 'Egypt',
        amount: '5000.00',
        currency: 'USD', // not allowed for Egypt!
        expectedRevision: 0,
      });

      expect(result.status).toBe('invalid_currency');
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('maps stale_salary_revision error', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'po-1',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      });
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { message: 'stale_salary_revision' },
      });

      const result = await setBasicSalary({
        employeeId: 'emp-1',
        effectiveMonth: '2026-11',
        market: 'Egypt',
        amount: '5000.00',
        currency: 'EGP',
        expectedRevision: 0,
      });

      expect(result.status).toBe('stale');
    });
  });

  describe('postMonetaryPayrollInput', () => {
    it('rejects a missing caller-owned intent instead of generating retry identities', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'po-1',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      });
      mocks.rpc.mockResolvedValue({ data: 'input-1', error: null });

      const result = await postMonetaryPayrollInput({
        employeeId: 'emp-1',
        effectiveMonth: '2026-11',
        category: 'incentive',
        amount: '250.50',
        currency: 'EGP',
      });

      expect(result).toEqual({ status: 'invalid_input' });
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('successfully posts an incentive input', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'po-1',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      });
      mocks.rpc.mockResolvedValue({
        data: 'input-1',
        error: null,
      });

      const result = await postMonetaryPayrollInput({
        employeeId: 'emp-1',
        effectiveMonth: '2026-11',
        category: 'incentive',
        amount: '250.50',
        currency: 'EGP',
        reasonRef: '22222222-2222-4222-8222-222222222222',
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
      });

      expect(mocks.rpc).toHaveBeenCalledWith(
        'p7_post_monetary_payroll_input',
        expect.objectContaining({
          p_employee_id: 'emp-1',
          p_effective_month: '2026-11-01',
          p_category: 'incentive',
          p_amount_minor: '25050',
          p_currency: 'EGP',
          p_reason_ref: '22222222-2222-4222-8222-222222222222',
          p_idempotency_key: '33333333-3333-4333-8333-333333333333',
          p_supersedes_input_id: null,
        }),
      );
      expect(result).toEqual({ status: 'ok', id: 'input-1' });
    });

    it('requires supersedesInputId for correction', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'po-1',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      });

      const result = await postMonetaryPayrollInput({
        employeeId: 'emp-1',
        effectiveMonth: '2026-11',
        category: 'correction',
        amount: '-100.00',
        currency: 'EGP',
      });

      expect(result.status).toBe('invalid_input');
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('maps salary_currency_mismatch error', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'po-1',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      });
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { message: 'salary_currency_mismatch' },
      });

      const result = await postMonetaryPayrollInput({
        employeeId: 'emp-1',
        effectiveMonth: '2026-11',
        category: 'deduction',
        amount: '100.00',
        currency: 'USD',
        reasonRef: '44444444-4444-4444-8444-444444444444',
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
      });

      expect(result.status).toBe('currency_mismatch');
    });
  });

  describe('createPayrollSnapshot', () => {
    it('creates snapshot and returns version and amount', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'po-1',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      });
      mocks.rpc.mockResolvedValue({
        data: {
          id: 'snap-1',
          version: 1,
          amount_minor: '525000',
          currency: 'EGP',
        },
        error: null,
      });

      const result = await createPayrollSnapshot({
        employeeId: 'emp-1',
        effectiveMonth: '2026-11',
      });

      expect(mocks.rpc).toHaveBeenCalledWith(
        'p7_create_payroll_snapshot',
        expect.objectContaining({
          p_employee_id: 'emp-1',
          p_effective_month: '2026-11-01',
        }),
      );
      expect(result).toEqual({
        status: 'ok',
        data: {
          id: 'snap-1',
          version: 1,
          amount_minor: '525000',
          currency: 'EGP',
        },
      });
    });
  });

  describe('approveExternalPayroll', () => {
    it('records external approval successfully', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'po-1',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      });
      mocks.rpc.mockResolvedValue({
        data: 'approval-1',
        error: null,
      });

      const result = await approveExternalPayroll({
        employeeId: 'emp-1',
        effectiveMonth: '2026-11',
        snapshotId: 'snap-1',
        snapshotVersion: 1,
        amountMinor: '525000',
        currency: 'EGP',
      });

      expect(mocks.rpc).toHaveBeenCalledWith(
        'p7_approve_external_payroll',
        expect.objectContaining({
          p_employee_id: 'emp-1',
          p_effective_month: '2026-11-01',
          p_snapshot_id: 'snap-1',
          p_snapshot_version: 1,
          p_amount_minor: '525000',
          p_currency: 'EGP',
        }),
      );
      expect(result).toEqual({ status: 'ok', id: 'approval-1' });
    });

    it('maps payroll_already_approved error', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'po-1',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      });
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { message: 'payroll_already_approved' },
      });

      const result = await approveExternalPayroll({
        employeeId: 'emp-1',
        effectiveMonth: '2026-11',
        snapshotId: 'snap-1',
        snapshotVersion: 1,
        amountMinor: '525000',
        currency: 'EGP',
      });

      expect(result.status).toBe('already_approved');
    });

    it('maps stale_payroll_snapshot error', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'po-1',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      });
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { message: 'stale_payroll_snapshot' },
      });

      const result = await approveExternalPayroll({
        employeeId: 'emp-1',
        effectiveMonth: '2026-11',
        snapshotId: 'snap-1',
        snapshotVersion: 1,
        amountMinor: '525000',
        currency: 'EGP',
      });

      expect(result.status).toBe('stale');
    });
  });
});

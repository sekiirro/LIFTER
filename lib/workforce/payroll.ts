import 'server-only';
import { randomUUID } from 'node:crypto';
import { getActor } from '../auth/actor';
import { createSessionClient } from '../supabase/server';
import {
  decimalToMinorUnits,
  isAllowedCurrencyForMarket,
} from './payroll-money';

export type PayrollMarket = 'Egypt' | 'International';
export type PayrollAdjustmentCategory =
  'incentive' | 'deduction' | 'correction';

export type EligibleEmployee = {
  userId: string;
  role: 'trainer' | 'sales';
};

export type SetBasicSalaryInput = {
  employeeId: string;
  effectiveMonth: string; // YYYY-MM or YYYY-MM-01
  market: PayrollMarket;
  amount: string; // decimal string
  currency: string;
  expectedRevision: number;
  idempotencyKey?: string;
};

export type SetBasicSalaryResult =
  | {
      status: 'ok';
      data: {
        id: string;
        revision: number;
        amount_minor: string;
        currency: string;
      };
    }
  | {
      status:
        | 'denied'
        | 'invalid_input'
        | 'invalid_currency'
        | 'stale'
        | 'not_eligible'
        | 'idempotency_reused'
        | 'error';
      message?: string;
    };

export type PostMonetaryInputParams = {
  employeeId: string;
  effectiveMonth: string;
  category: PayrollAdjustmentCategory;
  amount: string; // decimal string
  currency: string;
  reasonRef?: string;
  supersedesInputId?: string | null;
  idempotencyKey?: string;
};

export type PostMonetaryInputResult =
  | { status: 'ok'; id: string }
  | {
      status:
        | 'denied'
        | 'invalid_input'
        | 'currency_mismatch'
        | 'salary_required'
        | 'invalid_lineage'
        | 'not_eligible'
        | 'idempotency_reused'
        | 'error';
      message?: string;
    };

export type CreateSnapshotParams = {
  employeeId: string;
  effectiveMonth: string;
  idempotencyKey?: string;
};

export type CreateSnapshotResult =
  | {
      status: 'ok';
      data: {
        id: string;
        version: number;
        amount_minor: string;
        currency: string;
      };
    }
  | {
      status:
        | 'denied'
        | 'invalid_input'
        | 'salary_required'
        | 'currency_mismatch'
        | 'amount_out_of_range'
        | 'not_eligible'
        | 'error';
      message?: string;
    };

export type ApprovePayrollParams = {
  employeeId: string;
  effectiveMonth: string;
  snapshotId: string;
  snapshotVersion: number;
  amountMinor: string;
  currency: string;
  idempotencyKey?: string;
};

export type ApprovePayrollResult =
  | { status: 'ok'; id: string }
  | {
      status:
        | 'denied'
        | 'invalid_input'
        | 'already_approved'
        | 'stale'
        | 'binding_mismatch'
        | 'salary_required'
        | 'currency_mismatch'
        | 'not_eligible'
        | 'error';
      message?: string;
    };

export type PayrollMonthSnapshot = {
  id: string;
  version: number;
  amountMinor: string;
  currency: string;
};

export type PayrollMonthInput = {
  id: string;
  category: PayrollAdjustmentCategory;
  amountMinor: string;
  currency: string;
};

export type PayrollMonthApproval = {
  id: string;
  snapshotId: string;
  snapshotVersion: number;
  amountMinor: string;
  currency: string;
};

export type PayrollMonthState = {
  salary: {
    id: string;
    revision: number;
    amountMinor: string;
    currency: string;
    market: PayrollMarket;
  } | null;
  inputs: PayrollMonthInput[];
  snapshot: PayrollMonthSnapshot | null;
  approval: PayrollMonthApproval | null;
};

export type GetPayrollMonthParams = {
  employeeId: string;
  effectiveMonth: string;
};

export type GetPayrollMonthResult =
  | { status: 'ok'; data: PayrollMonthState }
  | { status: 'denied' | 'invalid_input' | 'unavailable' };

function normalizeEffectiveMonth(month: string): string | null {
  const trimmed = month.trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) {
    return `${trimmed}-01`;
  }
  if (/^\d{4}-(0[1-9]|1[0-2])-01$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export async function getEligibleEmployees(): Promise<
  | { status: 'ok'; employees: EligibleEmployee[] }
  | { status: 'denied' }
  | { status: 'unavailable' }
> {
  const actor = await getActor();
  if (!actor || actor.role !== 'platform_owner') {
    return { status: 'denied' };
  }

  const client = await createSessionClient();
  if (!client) return { status: 'unavailable' };

  const { data, error } = await client
    .from('staff_profiles')
    .select('user_id, role')
    .in('role', ['trainer', 'sales']);

  if (error) {
    return { status: 'unavailable' };
  }

  const employees: EligibleEmployee[] = (data ?? []).map((row) => ({
    userId: row.user_id,
    role: row.role as 'trainer' | 'sales',
  }));

  return { status: 'ok', employees };
}

export async function getPayrollMonth(
  params: GetPayrollMonthParams,
): Promise<GetPayrollMonthResult> {
  const actor = await getActor();
  if (!actor || actor.role !== 'platform_owner') {
    return { status: 'denied' };
  }

  const effectiveMonth = normalizeEffectiveMonth(params.effectiveMonth);
  if (!effectiveMonth) return { status: 'invalid_input' };

  const client = await createSessionClient();
  if (!client) return { status: 'unavailable' };

  const { data, error } = await client.rpc('p7_get_payroll_month', {
    p_employee_id: params.employeeId,
    p_effective_month: effectiveMonth,
  });
  if (error || !data) return { status: 'unavailable' };

  const row = data as {
    salary: {
      id: string;
      revision: number;
      amount_minor: string;
      currency: string;
      market: PayrollMarket;
    } | null;
    inputs: Array<{
      id: string;
      category: PayrollAdjustmentCategory;
      amount_minor: string;
      currency: string;
    }>;
    snapshot: {
      id: string;
      version: number;
      amount_minor: string;
      currency: string;
    } | null;
    approval: {
      id: string;
      snapshot_id: string;
      snapshot_version: number;
      amount_minor: string;
      currency: string;
    } | null;
  };

  return {
    status: 'ok',
    data: {
      salary: row.salary
        ? {
            id: row.salary.id,
            revision: row.salary.revision,
            amountMinor: row.salary.amount_minor,
            currency: row.salary.currency,
            market: row.salary.market,
          }
        : null,
      inputs: (row.inputs ?? []).map((input) => ({
        id: input.id,
        category: input.category,
        amountMinor: input.amount_minor,
        currency: input.currency,
      })),
      snapshot: row.snapshot
        ? {
            id: row.snapshot.id,
            version: row.snapshot.version,
            amountMinor: row.snapshot.amount_minor,
            currency: row.snapshot.currency,
          }
        : null,
      approval: row.approval
        ? {
            id: row.approval.id,
            snapshotId: row.approval.snapshot_id,
            snapshotVersion: row.approval.snapshot_version,
            amountMinor: row.approval.amount_minor,
            currency: row.approval.currency,
          }
        : null,
    },
  };
}

export async function setBasicSalary(
  input: SetBasicSalaryInput,
): Promise<SetBasicSalaryResult> {
  const actor = await getActor();
  if (!actor || actor.role !== 'platform_owner') {
    return { status: 'denied' };
  }

  const client = await createSessionClient();
  if (!client) return { status: 'error' };

  const effectiveMonth = normalizeEffectiveMonth(input.effectiveMonth);
  if (!effectiveMonth) {
    return { status: 'invalid_input' };
  }

  if (!isAllowedCurrencyForMarket(input.market, input.currency)) {
    return {
      status: 'invalid_currency',
    };
  }

  const minor = decimalToMinorUnits(input.amount);
  if (minor === null || minor <= 0n) {
    return {
      status: 'invalid_input',
    };
  }

  const idempotencyKey = input.idempotencyKey || randomUUID();

  const { data, error } = await client.rpc('p7_set_basic_salary', {
    p_employee_id: input.employeeId,
    p_effective_month: effectiveMonth,
    p_market: input.market,
    p_amount_minor: minor.toString(),
    p_currency: input.currency,
    p_expected_revision: input.expectedRevision,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('p7_platform_owner_required')) return { status: 'denied' };
    if (msg.includes('stale_salary_revision')) return { status: 'stale' };
    if (msg.includes('invalid_market_currency'))
      return { status: 'invalid_currency' };
    if (msg.includes('payroll_employee_not_eligible'))
      return { status: 'not_eligible' };
    if (msg.includes('idempotency_key_reused'))
      return { status: 'idempotency_reused' };
    if (msg.includes('invalid_salary_input'))
      return { status: 'invalid_input' };
    return { status: 'error' };
  }

  return {
    status: 'ok',
    data: data as {
      id: string;
      revision: number;
      amount_minor: string;
      currency: string;
    },
  };
}

export async function postMonetaryPayrollInput(
  input: PostMonetaryInputParams,
): Promise<PostMonetaryInputResult> {
  const actor = await getActor();
  if (!actor || actor.role !== 'platform_owner') {
    return { status: 'denied' };
  }

  const client = await createSessionClient();
  if (!client) return { status: 'error' };

  const effectiveMonth = normalizeEffectiveMonth(input.effectiveMonth);
  if (!effectiveMonth) {
    return { status: 'invalid_input' };
  }

  const minor = decimalToMinorUnits(input.amount);
  if (minor === null) {
    return { status: 'invalid_input' };
  }

  if (input.category === 'correction') {
    if (minor === 0n) {
      return {
        status: 'invalid_input',
      };
    }
    if (!input.supersedesInputId) {
      return {
        status: 'invalid_input',
      };
    }
  } else {
    if (minor <= 0n) {
      return {
        status: 'invalid_input',
      };
    }
    if (input.supersedesInputId) {
      return {
        status: 'invalid_input',
      };
    }
  }

  if (!input.reasonRef || !input.idempotencyKey) {
    return { status: 'invalid_input' };
  }
  const reasonRef = input.reasonRef;
  const idempotencyKey = input.idempotencyKey;

  const { data, error } = await client.rpc('p7_post_monetary_payroll_input', {
    p_employee_id: input.employeeId,
    p_effective_month: effectiveMonth,
    p_category: input.category,
    p_amount_minor: minor.toString(),
    p_currency: input.currency,
    p_reason_ref: reasonRef,
    p_supersedes_input_id: input.supersedesInputId ?? null,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('p7_platform_owner_required')) return { status: 'denied' };
    if (msg.includes('salary_currency_mismatch'))
      return { status: 'currency_mismatch' };
    if (msg.includes('salary_required')) return { status: 'salary_required' };
    if (msg.includes('invalid_payroll_input_lineage'))
      return { status: 'invalid_lineage' };
    if (msg.includes('payroll_employee_not_eligible'))
      return { status: 'not_eligible' };
    if (msg.includes('idempotency_key_reused'))
      return { status: 'idempotency_reused' };
    if (msg.includes('invalid_payroll_input'))
      return { status: 'invalid_input' };
    return { status: 'error' };
  }

  return { status: 'ok', id: data as string };
}

export async function createPayrollSnapshot(
  params: CreateSnapshotParams,
): Promise<CreateSnapshotResult> {
  const actor = await getActor();
  if (!actor || actor.role !== 'platform_owner') {
    return { status: 'denied' };
  }

  const client = await createSessionClient();
  if (!client) return { status: 'error' };

  const effectiveMonth = normalizeEffectiveMonth(params.effectiveMonth);
  if (!effectiveMonth) {
    return { status: 'invalid_input' };
  }

  const idempotencyKey = params.idempotencyKey || randomUUID();

  const { data, error } = await client.rpc('p7_create_payroll_snapshot', {
    p_employee_id: params.employeeId,
    p_effective_month: effectiveMonth,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('p7_platform_owner_required')) return { status: 'denied' };
    if (msg.includes('salary_required')) return { status: 'salary_required' };
    if (msg.includes('payroll_currency_mismatch'))
      return { status: 'currency_mismatch' };
    if (msg.includes('payroll_amount_out_of_range'))
      return { status: 'amount_out_of_range' };
    if (msg.includes('payroll_employee_not_eligible'))
      return { status: 'not_eligible' };
    if (msg.includes('invalid_payroll_snapshot'))
      return { status: 'invalid_input' };
    return { status: 'error' };
  }

  return {
    status: 'ok',
    data: data as {
      id: string;
      version: number;
      amount_minor: string;
      currency: string;
    },
  };
}

export async function approveExternalPayroll(
  params: ApprovePayrollParams,
): Promise<ApprovePayrollResult> {
  const actor = await getActor();
  if (!actor || actor.role !== 'platform_owner') {
    return { status: 'denied' };
  }

  const client = await createSessionClient();
  if (!client) return { status: 'error' };

  const effectiveMonth = normalizeEffectiveMonth(params.effectiveMonth);
  if (!effectiveMonth) {
    return { status: 'invalid_input' };
  }

  const idempotencyKey = params.idempotencyKey || randomUUID();

  const { data, error } = await client.rpc('p7_approve_external_payroll', {
    p_employee_id: params.employeeId,
    p_effective_month: effectiveMonth,
    p_snapshot_id: params.snapshotId,
    p_snapshot_version: params.snapshotVersion,
    p_amount_minor: params.amountMinor,
    p_currency: params.currency,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('p7_platform_owner_required')) return { status: 'denied' };
    if (msg.includes('payroll_already_approved'))
      return { status: 'already_approved' };
    if (msg.includes('stale_payroll_snapshot')) return { status: 'stale' };
    if (msg.includes('snapshot_binding_mismatch'))
      return { status: 'binding_mismatch' };
    if (msg.includes('salary_required')) return { status: 'salary_required' };
    if (msg.includes('payroll_currency_mismatch'))
      return { status: 'currency_mismatch' };
    if (msg.includes('payroll_employee_not_eligible'))
      return { status: 'not_eligible' };
    if (msg.includes('invalid_payroll_approval'))
      return { status: 'invalid_input' };
    return { status: 'error' };
  }

  return { status: 'ok', id: data as string };
}

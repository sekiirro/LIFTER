'use server';

import { revalidatePath } from 'next/cache';
import {
  setBasicSalary,
  postMonetaryPayrollInput,
  createPayrollSnapshot,
  approveExternalPayroll,
  getEligibleEmployees,
  getPayrollMonth,
  type SetBasicSalaryInput,
  type PostMonetaryInputParams,
  type CreateSnapshotParams,
  type ApprovePayrollParams,
  type GetPayrollMonthParams,
} from '../../../lib/workforce/payroll';

export async function setBasicSalaryAction(input: SetBasicSalaryInput) {
  const result = await setBasicSalary(input);
  if (result.status === 'ok') {
    revalidatePath('/payroll');
  }
  return result;
}

export async function postMonetaryPayrollInputAction(
  input: PostMonetaryInputParams,
) {
  const result = await postMonetaryPayrollInput(input);
  if (result.status === 'ok') {
    revalidatePath('/payroll');
  }
  return result;
}

export async function createPayrollSnapshotAction(
  params: CreateSnapshotParams,
) {
  const result = await createPayrollSnapshot(params);
  if (result.status === 'ok') {
    revalidatePath('/payroll');
  }
  return result;
}

export async function approveExternalPayrollAction(
  params: ApprovePayrollParams,
) {
  const result = await approveExternalPayroll(params);
  if (result.status === 'ok') {
    revalidatePath('/payroll');
  }
  return result;
}

export async function getEligibleEmployeesAction() {
  return await getEligibleEmployees();
}

export async function getPayrollMonthAction(params: GetPayrollMonthParams) {
  return await getPayrollMonth(params);
}

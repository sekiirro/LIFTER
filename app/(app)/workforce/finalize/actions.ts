'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '../../../../lib/auth/actor';
import {
  finalizeMonthRpc,
  getCurrentCairoMonth,
  isValidMonth,
  type FinalizeResult,
} from '../../../../lib/workforce/finalize';

export async function finalizeMonthAction(input: {
  workspaceId: string;
  month: string;
}): Promise<FinalizeResult> {
  const actor = await requireActor();
  if (actor.role !== 'platform_owner') {
    return { status: 'not_permitted' };
  }

  if (!isValidMonth(input.month)) {
    return { status: 'invalid_period' };
  }

  const currentMonth = getCurrentCairoMonth();
  if (input.month >= currentMonth) {
    return { status: 'invalid_period' };
  }

  const result = await finalizeMonthRpc(input.workspaceId, input.month);
  if (result.status === 'finalized') {
    revalidatePath('/workforce/finalize');
    revalidatePath('/reports');
    revalidatePath('/workforce/report');
    revalidatePath('/workforce/sales-projection');
    revalidatePath('/sales-projection');
  }

  return result;
}

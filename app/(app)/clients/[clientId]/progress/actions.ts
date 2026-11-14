'use server';

import { revalidatePath } from 'next/cache';
import { correctMeasurement } from '../../../../../lib/progress-coaching/service';

const STAFF_PROGRESS_PATH = '/clients/[clientId]/progress';

/**
 * FR-013: any authorized coaching staff member corrects a measurement in place.
 * The service re-parses the input and applies authorize(); the RPC re-checks
 * has_workspace_access(coaching_work) and the optimistic version.
 */
export async function correctMeasurementAction(input: unknown) {
  const result = await correctMeasurement(input);
  if (result.status === 'corrected' || result.status === 'conflict')
    revalidatePath(STAFF_PROGRESS_PATH, 'page');
  return result;
}

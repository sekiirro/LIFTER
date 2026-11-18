'use server';

import { revalidatePath } from 'next/cache';
import {
  recordOwnMeasurement,
  updateOwnMeasurement,
} from '../../../lib/progress-coaching/service';

/** FR-012/FR-015 client manual entry; the service parses and re-authorizes. */
export async function recordOwnMeasurementAction(input: unknown) {
  const result = await recordOwnMeasurement(input);
  if (result.status === 'recorded') revalidatePath('/progress');
  return result;
}

/** PO 2026-11-14: the client edits an own manual measurement in place. */
export async function updateOwnMeasurementAction(input: unknown) {
  const result = await updateOwnMeasurement(input);
  if (result.status === 'updated' || result.status === 'conflict')
    revalidatePath('/progress');
  return result;
}

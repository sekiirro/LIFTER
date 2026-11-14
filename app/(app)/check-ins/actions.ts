'use server';

import { revalidatePath } from 'next/cache';
import { configureCheckinForm } from '../../../lib/progress-coaching/checkins/configuration';

/** Staff choice of the weekly check-in form; parsed and re-authorized in the service. */
export async function configureCheckinFormAction(input: unknown) {
  const result = await configureCheckinForm(input);
  if (result.status === 'configured') revalidatePath('/check-ins');
  return result;
}

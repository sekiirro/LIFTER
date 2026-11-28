'use server';

import { revalidatePath } from 'next/cache';
import {
  recordMonthlyQuality,
  type RecordQualityInput,
} from '../../../../lib/workforce/quality-server';

export async function recordMonthlyQualityAction(input: RecordQualityInput) {
  const result = await recordMonthlyQuality(input);
  if (result.status === 'ok') revalidatePath('/workforce/quality');
  return result;
}

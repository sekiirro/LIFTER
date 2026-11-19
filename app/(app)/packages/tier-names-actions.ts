'use server';
import { revalidatePath } from 'next/cache';
import * as tierNames from '../../../lib/packages/tier-names';
export async function renamePlatformTierName(input: unknown) {
  const result = await tierNames.renamePlatformTierName(input);
  if (result.status === 'ok') revalidatePath('/packages');
  return result;
}
export async function setWorkspaceTierNameOverride(input: unknown) {
  const result = await tierNames.setWorkspaceTierNameOverride(input);
  if (result.status === 'ok') revalidatePath('/packages');
  return result;
}

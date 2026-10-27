'use server';
import { revalidatePath } from 'next/cache';
import * as service from '../../../lib/packages/service';
export async function createPackage(input: unknown) {
  const result = await service.createPackage(input);
  if (result.status === 'ok') revalidatePath('/packages');
  return result;
}
export async function publishPackageVersion(input: unknown) {
  const result = await service.publishPackageVersion(input);
  if (result.status === 'ok') revalidatePath('/packages');
  return result;
}
export async function setPackageOfferAvailable(input: unknown) {
  const result = await service.setPackageOfferAvailable(input);
  if (result.status === 'ok') revalidatePath('/packages');
  return result;
}

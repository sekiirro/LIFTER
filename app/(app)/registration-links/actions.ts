'use server';
import { revalidatePath } from 'next/cache';
import { issueRegistrationLink } from '../../../lib/registration-links/service';
export async function issueRegistrationLinkAction(input: unknown) {
  const result = await issueRegistrationLink(input);
  if (result.status === 'ok') revalidatePath('/registration-links');
  return result;
}

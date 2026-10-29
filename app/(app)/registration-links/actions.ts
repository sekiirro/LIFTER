'use server';
import { revalidatePath } from 'next/cache';
import { issueRegistrationLink } from '../../../lib/registration-links/service';
import type { IssueResult } from '../../../lib/registration-links/results';
// Both v2 paymentTerms and legacy installments enter the same authenticated
// service boundary. Revalidate only after its issuance RPC commits successfully.
export async function issueRegistrationLinkAction(
  input: unknown,
): Promise<IssueResult> {
  const result = await issueRegistrationLink(input);
  if (result.status === 'ok') revalidatePath('/registration-links');
  return result;
}

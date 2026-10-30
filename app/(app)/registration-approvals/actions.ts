'use server';

import { revalidatePath } from 'next/cache';
import {
  readRegistrationApprovalQueue,
  readRegistrationApprovalReview,
  readSubscriptionCommission,
  readSubscriptionPaymentStatus,
  readWorkspacePaymentQueue,
} from '../../../lib/registration-approval/read';
import { executeRegistrationApprovalAction } from '../../../lib/registration-approval/service';

async function mutation(
  operation: 'approve' | 'reject' | 'reconsider' | 'collect' | 'correct',
  input: unknown,
) {
  const result = await executeRegistrationApprovalAction(operation, input);
  if (result.status === 'ok') {
    revalidatePath('/registration-approvals');
    revalidatePath('/registration-approvals/[clientId]', 'page');
    revalidatePath('/payments/[subscriptionId]', 'page');
  }
  return result;
}

export async function approveRegistrationAction(input: unknown) {
  return mutation('approve', input);
}
export async function rejectRegistrationAction(input: unknown) {
  return mutation('reject', input);
}
export async function reconsiderRegistrationAction(input: unknown) {
  return mutation('reconsider', input);
}
export async function recordInstallmentAction(input: unknown) {
  return mutation('collect', input);
}
export async function correctCollectionAction(input: unknown) {
  return mutation('correct', input);
}

export async function registrationApprovalQueueAction(input: unknown) {
  return readRegistrationApprovalQueue(input);
}
export async function registrationApprovalReviewAction(input: unknown) {
  return readRegistrationApprovalReview(input);
}
export async function workspacePaymentQueueAction(input: unknown) {
  return readWorkspacePaymentQueue(input);
}
export async function subscriptionPaymentStatusAction(input: unknown) {
  return readSubscriptionPaymentStatus(input);
}
export async function subscriptionCommissionAction(input: unknown) {
  return readSubscriptionCommission(input);
}

'use server';

import { generateRecoveryLink } from '../../../lib/auth/recovery-link';

export async function generateRecoveryLinkAction(targetUserId: string) {
  return generateRecoveryLink(targetUserId);
}

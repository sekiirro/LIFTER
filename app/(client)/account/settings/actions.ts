'use server';

import { revalidatePath } from 'next/cache';
import { getActor } from '../../../../lib/auth/actor';
import {
  optOutOfLeaderboard,
  updateOwnUsername,
  type OptOutStatus,
} from '../../../../lib/leaderboard/service';
import type { UsernameUpdateStatus } from '../../../../lib/leaderboard/username';

export type UsernameActionState = { status: UsernameUpdateStatus | 'idle' };
export type OptOutActionState = { status: OptOutStatus | 'idle' };

/** S55-PO-6 Q11: the client edits only their own username; identity comes from the session. */
export async function updateUsernameAction(
  _previous: UsernameActionState,
  formData: FormData,
): Promise<UsernameActionState> {
  const status = await updateOwnUsername(
    await getActor(),
    formData.get('username'),
  );
  if (status === 'updated') {
    revalidatePath('/account/settings');
    revalidatePath('/leaderboard');
  }
  return { status };
}

/** S55-PO-6 Q13: direct, immediate, audited opt-out; no request queue. */
export async function optOutAction(
  _previous: OptOutActionState,
  _formData: FormData,
): Promise<OptOutActionState> {
  void _formData;
  const status = await optOutOfLeaderboard(await getActor());
  if (status === 'opted_out' || status === 'already_opted_out') {
    revalidatePath('/account/settings');
    revalidatePath('/leaderboard');
  }
  return { status };
}

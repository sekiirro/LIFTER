'use server';

import { redirect } from 'next/navigation';
import { createSessionClient } from '../../../lib/supabase/server';
import type { RecoveryResult } from '../../../lib/auth/results';
import { isRecoverySession } from '../../../lib/auth/recovery-session';

export async function verifyRecovery(
  _previous: RecoveryResult | null,
  form: FormData,
): Promise<RecoveryResult> {
  try {
    const hash = form.get('token_hash');
    if (typeof hash !== 'string' || !hash) return { status: 'invalid_link' };
    const client = await createSessionClient();
    if (!client) return { status: 'invalid_link' };
    const { error } = await client.auth.verifyOtp({
      type: 'recovery',
      token_hash: hash,
    });
    return { status: error ? 'invalid_link' : 'ok' };
  } catch {
    return { status: 'invalid_link' };
  }
}

export async function setNewPassword(
  _previous: RecoveryResult | null,
  form: FormData,
): Promise<RecoveryResult> {
  try {
    const client = await createSessionClient();
    if (!client) return { status: 'invalid_link' };
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return { status: 'invalid_link' };
    const claims = await client.auth.getClaims();
    if (
      claims.error ||
      !isRecoverySession(claims.data?.claims.amr, Math.floor(Date.now() / 1000))
    )
      return { status: 'invalid_link' };
    const password = form.get('password');
    const confirm = form.get('confirm');
    if (
      typeof password !== 'string' ||
      typeof confirm !== 'string' ||
      password !== confirm
    )
      return { status: 'mismatch' };
    const updated = await client.auth.updateUser({ password });
    if (updated.error)
      return {
        status:
          updated.error.code === 'weak_password'
            ? 'weak_password'
            : 'invalid_link',
      };
  } catch {
    return { status: 'invalid_link' };
  }
  redirect('/');
}

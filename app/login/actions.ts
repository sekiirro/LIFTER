'use server';

import { redirect } from 'next/navigation';
import { createSessionClient } from '../../lib/supabase/server';
import { readServerEnv } from '../../lib/supabase/env';
import { normalizedEmail } from '../../lib/client-accounts/validation';
import {
  buildStaffResetRedirectTo,
  isLocalStaffResetEnvironment,
} from '../../lib/auth/staff-reset';
import { safeReturnTo } from '../../lib/auth/redirect';
import type { SignInResult } from '../../lib/auth/results';

export async function signIn(
  _previous: SignInResult | null,
  form: FormData,
): Promise<SignInResult> {
  try {
    const client = await createSessionClient();
    if (!client) return { status: 'unavailable' };
    const email = form.get('email');
    const password = form.get('password');
    if (typeof email !== 'string' || typeof password !== 'string')
      return { status: 'invalid_credentials' };
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error)
      return {
        status:
          error.name === 'AuthRetryableFetchError'
            ? 'unavailable'
            : 'invalid_credentials',
      };
  } catch {
    return { status: 'unavailable' };
  }
  redirect(safeReturnTo(form.get('next')));
}

export type StaffResetRequestResult = { status: 'ok' | 'invalidEmail' };

const STAFF_RESET_RESPONSE_FLOOR_MS = 500;
const STAFF_RESET_TIMER_MARGIN_MS = 5;

async function enforceStaffResetResponseFloor(
  startedAt: number,
): Promise<void> {
  const remaining =
    STAFF_RESET_RESPONSE_FLOOR_MS +
    STAFF_RESET_TIMER_MARGIN_MS -
    (performance.now() - startedAt);
  if (remaining > 0)
    await new Promise<void>((resolve) => setTimeout(resolve, remaining));
}

export async function requestStaffReset(
  _previous: StaffResetRequestResult | null,
  form: FormData,
): Promise<StaffResetRequestResult> {
  const email = normalizedEmail(form.get('email'));
  if (!email) return { status: 'invalidEmail' };

  const startedAt = performance.now();
  try {
    const env = readServerEnv();
    const client = await createSessionClient();
    if (env && client && isLocalStaffResetEnvironment(env.url, env.appOrigin)) {
      await client.auth.resetPasswordForEmail(email, {
        redirectTo: buildStaffResetRedirectTo(env.appOrigin),
      });
    }
  } catch {
    // Valid addresses always receive the same confirmation, including provider failures.
  }
  await enforceStaffResetResponseFloor(startedAt);
  return { status: 'ok' };
}

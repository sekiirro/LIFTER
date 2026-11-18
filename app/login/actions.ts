'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createSessionClient } from '../../lib/supabase/server';
import { safeReturnTo } from '../../lib/auth/redirect';
import type { SignInResult } from '../../lib/auth/results';
import {
  buildStaffResetRedirectTo,
  isSyntacticallyValidStaffResetEmail,
} from '../../lib/auth/staff-reset';
import { withStaffResetMinimumResponse } from '../../lib/auth/staff-reset-timing';
import { readServerEnv } from '../../lib/supabase/env';
import { LOCALE_COOKIE, parseLocale } from '../../lib/design/preferences';

export type StaffResetResult = { status: 'staffResetConfirm' | 'invalidEmail' };

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

export async function requestStaffReset(
  _previous: StaffResetResult | null,
  form: FormData,
): Promise<StaffResetResult> {
  const rawEmail = form.get('email');
  if (
    typeof rawEmail !== 'string' ||
    !isSyntacticallyValidStaffResetEmail(rawEmail)
  )
    return { status: 'invalidEmail' };

  return withStaffResetMinimumResponse(async () => {
    try {
      const env = readServerEnv();
      const redirectTo = new URL(buildStaffResetRedirectTo(env?.appOrigin));
      const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
      redirectTo.searchParams.set('flow', 'staff');
      redirectTo.searchParams.set('locale', locale);
      const client = await createSessionClient();
      if (!client) return { status: 'staffResetConfirm' };
      await client.auth.resetPasswordForEmail(rawEmail.trim(), {
        redirectTo: redirectTo.toString(),
      });
    } catch {
      // Keep provider, account, audit, and transport details out of the response.
    }
    return { status: 'staffResetConfirm' };
  });
}

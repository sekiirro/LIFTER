'use server';

import { redirect } from 'next/navigation';
import { createSessionClient } from '../../lib/supabase/server';
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

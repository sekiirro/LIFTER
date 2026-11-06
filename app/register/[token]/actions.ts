'use server';

import { cookies, headers } from 'next/headers';
import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { createPublicSessionClient } from '../../../lib/supabase/public-session';
import { processClientSignup } from '../../../lib/client-accounts/service';
import {
  signupResult,
  type SignupLocale,
  type SignupPublicResult,
} from '../../../lib/client-accounts/results';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';

export async function submitClientSignup(
  token: string,
  _previousState: SignupPublicResult,
  formData: FormData,
): Promise<SignupPublicResult> {
  let locale: SignupLocale = 'ar';
  try {
    const requestHeaders = await headers();
    locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
    const submitted: Record<string, unknown> = {};
    const signupFieldNames = new Set([
      'name',
      'dateOfBirth',
      'username',
      'telegramUsername',
      'email',
      'phone',
      'password',
    ]);
    for (const [key, entry] of formData.entries()) {
      if (key === 'request_secret' || key.startsWith('$ACTION_')) continue;
      if (!signupFieldNames.has(key)) {
        submitted.__invalid_signup_shape = true;
        continue;
      }
      if (Object.hasOwn(submitted, key)) {
        const prior = submitted[key];
        submitted[key] = Array.isArray(prior)
          ? [...prior, entry]
          : [prior, entry];
      } else submitted[key] = entry;
    }
    const sessionState = async () => {
      const sessionClient = await createPublicSessionClient();
      if (!sessionClient) throw new Error('Public session client unavailable');
      const { data, error } = await sessionClient.auth.getUser();
      if (error) {
        if (isAuthSessionMissingError(error)) return false;
        throw error;
      }
      return !!data.user;
    };
    return await processClientSignup({
      token,
      requestSecret: formData.get('request_secret'),
      fields: submitted,
      origin: requestHeaders.get('origin'),
      expectedOrigin: process.env.APP_ORIGIN,
      headers: requestHeaders,
      signedIn: sessionState,
      locale,
    });
  } catch {
    return signupResult('unavailable', locale);
  }
}

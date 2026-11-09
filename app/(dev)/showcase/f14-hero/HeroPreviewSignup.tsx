'use client';

import { SignupForm } from '../../../register/[token]/SignupForm';
import type { PhoneCountryOption } from '../../../../lib/client-accounts/phone';
import {
  initialSignupResult,
  type SignupPublicResult,
} from '../../../../lib/client-accounts/results';
import type { Locale } from '../../../../lib/design/preferences';

/**
 * The showcase has no database, so the preview form never submits a real
 * signup. It reuses the production form so the hero material is measured
 * against the same controls the public page renders.
 */
async function previewSignup(): Promise<SignupPublicResult> {
  return initialSignupResult;
}

export function HeroPreviewSignup({
  locale,
  phoneCountries,
}: {
  locale: Locale;
  phoneCountries: PhoneCountryOption[];
}) {
  return (
    <SignupForm
      action={previewSignup}
      locale={locale}
      phoneCountries={phoneCountries}
    />
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { SignupForm } from '../../../register/[token]/SignupForm';
import {
  signupResult,
  type SignupLocale,
  type SignupPublicResult,
} from '../../../../lib/client-accounts/results';
import type { PhoneCountryOption } from '../../../../lib/client-accounts/phone';

export function HeroSignupPreview({
  locale,
  phoneCountries,
}: {
  locale: SignupLocale;
  phoneCountries: PhoneCountryOption[];
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hostRef.current) hostRef.current.dataset.hydrated = 'true';
  }, []);

  async function showOfflineResult(
    _previous: SignupPublicResult,
    _formData: FormData,
  ): Promise<SignupPublicResult> {
    void _previous;
    void _formData;
    return signupResult('unavailable', locale);
  }

  return (
    <div
      ref={hostRef}
      className="hero-signup-preview"
      data-testid="hero-signup-preview"
    >
      <SignupForm
        action={showOfflineResult}
        locale={locale}
        phoneCountries={phoneCountries}
      />
    </div>
  );
}

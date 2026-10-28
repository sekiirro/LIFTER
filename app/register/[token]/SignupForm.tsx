'use client';

import { useActionState, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import {
  initialSignupResult,
  type SignupLocale,
  type SignupPublicResult,
} from '../../../lib/client-accounts/results';
import type { PhoneCountryOption } from '../../../lib/client-accounts/phone';
import styles from './signup.module.css';

type SignupAction = (
  previous: SignupPublicResult,
  formData: FormData,
) => Promise<SignupPublicResult>;

const copy = {
  en: {
    name: 'Name',
    email: 'Email',
    country: 'Country',
    phone: 'Phone number',
    password: 'Password',
    submit: 'Create registration request',
    pending: 'Submitting',
    field: 'Please check this field.',
    signedIn:
      'Please sign out before submitting this registration request. Return to this page after signing out.',
  },
  ar: {
    name: 'الاسم',
    email: 'البريد الإلكتروني',
    country: 'الدولة',
    phone: 'رقم الهاتف',
    password: 'كلمة المرور',
    submit: 'إرسال طلب التسجيل',
    pending: 'جارٍ الإرسال',
    field: 'يرجى التحقق من هذا الحقل.',
    signedIn:
      'يرجى تسجيل الخروج قبل إرسال طلب التسجيل هذا. عُد إلى هذه الصفحة بعد تسجيل الخروج.',
  },
} satisfies Record<SignupLocale, Record<string, string>>;

function newRequestSecret(): string {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function SignupForm({
  action,
  locale,
  phoneCountries,
}: {
  action: SignupAction;
  locale: SignupLocale;
  phoneCountries: PhoneCountryOption[];
}) {
  const submittingRef = useRef(false);
  const [result, formAction, pending] = useActionState(
    async (previous: SignupPublicResult, formData: FormData) => {
      try {
        return await action(previous, formData);
      } finally {
        submittingRef.current = false;
      }
    },
    initialSignupResult,
  );
  const [country, setCountry] = useState('EG');
  const [nationalNumber, setNationalNumber] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const messages = copy[locale];
  const selectedCountry =
    phoneCountries.find((option) => option.code === country) ??
    phoneCountries.find((option) => option.code === 'EG');

  if (result.status === 'sign_out_required')
    return (
      <p role="status" className={styles.message}>
        {messages.signedIn}
      </p>
    );

  return (
    <form
      ref={formRef}
      action={formAction}
      className={styles.form}
      onSubmit={(event) => {
        if (submittingRef.current) {
          event.preventDefault();
          return;
        }
        submittingRef.current = true;
        setSubmitted(true);
        const secret = event.currentTarget.elements.namedItem('request_secret');
        if (secret instanceof HTMLInputElement)
          secret.value = newRequestSecret();
      }}
      noValidate
    >
      <input type="hidden" name="request_secret" defaultValue="" />
      <input
        type="hidden"
        name="phone"
        value={JSON.stringify({ country, nationalNumber })}
        readOnly
      />
      <label className={styles.field}>
        <span>{messages.name}</span>
        <input
          name="name"
          aria-label={messages.name}
          aria-describedby={
            submitted && result.invalidFields?.includes('name')
              ? 'signup-name-error'
              : undefined
          }
          type="text"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          autoComplete="name"
          required
          disabled={pending}
          aria-invalid={submitted && result.invalidFields?.includes('name')}
        />
        {submitted && result.invalidFields?.includes('name') && (
          <span id="signup-name-error" className={styles.fieldError}>
            {messages.field}
          </span>
        )}
      </label>
      <label className={styles.field}>
        <span>{messages.email}</span>
        <input
          name="email"
          aria-label={messages.email}
          aria-describedby={
            submitted && result.invalidFields?.includes('email')
              ? 'signup-email-error'
              : undefined
          }
          type="email"
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          autoComplete="email"
          required
          disabled={pending}
          aria-invalid={submitted && result.invalidFields?.includes('email')}
        />
        {submitted && result.invalidFields?.includes('email') && (
          <span id="signup-email-error" className={styles.fieldError}>
            {messages.field}
          </span>
        )}
      </label>
      <div className={styles.phoneFields}>
        <label className={styles.field}>
          <span>{messages.country}</span>
          <select
            aria-label={messages.country}
            value={country}
            disabled={pending}
            onChange={(event) => setCountry(event.currentTarget.value)}
          >
            {phoneCountries.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name} (+{option.callingCode})
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>{messages.phone}</span>
          <span className={styles.phoneNumber}>
            <span aria-hidden="true">
              +{selectedCountry?.callingCode ?? '20'}
            </span>
            <input
              aria-label={messages.phone}
              aria-describedby={
                submitted && result.invalidFields?.includes('phone')
                  ? 'signup-phone-error'
                  : undefined
              }
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              required
              disabled={pending}
              value={nationalNumber}
              onChange={(event) => setNationalNumber(event.currentTarget.value)}
              aria-invalid={
                submitted && result.invalidFields?.includes('phone')
              }
            />
          </span>
          {submitted && result.invalidFields?.includes('phone') && (
            <span id="signup-phone-error" className={styles.fieldError}>
              {messages.field}
            </span>
          )}
        </label>
      </div>
      <label className={styles.field}>
        <span>{messages.password}</span>
        <input
          name="password"
          aria-label={messages.password}
          aria-describedby={
            submitted && result.invalidFields?.includes('password')
              ? 'signup-password-error'
              : undefined
          }
          type="password"
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
          autoComplete="new-password"
          required
          disabled={pending}
          aria-invalid={submitted && result.invalidFields?.includes('password')}
        />
        {submitted && result.invalidFields?.includes('password') && (
          <span id="signup-password-error" className={styles.fieldError}>
            {messages.field}
          </span>
        )}
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? messages.pending : messages.submit}
      </Button>
      {submitted && (
        <p
          role={result.status === 'invalid_input' ? 'alert' : 'status'}
          className={styles.message}
          aria-live="polite"
        >
          {result.message}
        </p>
      )}
    </form>
  );
}

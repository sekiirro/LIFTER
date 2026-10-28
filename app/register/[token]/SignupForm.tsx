'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import {
  initialSignupResult,
  type SignupLocale,
  type SignupPublicResult,
} from '../../../lib/client-accounts/results';
import type { PhoneCountryOption } from '../../../lib/client-accounts/phone';
import { getMessages } from '../../../lib/i18n';
import styles from './signup.module.css';

type SignupAction = (
  previous: SignupPublicResult,
  formData: FormData,
) => Promise<SignupPublicResult>;

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
  const resultRef = useRef<HTMLParagraphElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const allMessages = getMessages(locale);
  const messages = {
    name: allMessages['clientSignup.name'],
    email: allMessages['clientSignup.email'],
    country: allMessages['clientSignup.country'],
    phone: allMessages['clientSignup.phone'],
    password: allMessages['clientSignup.password'],
    submit: allMessages['clientSignup.submit'],
    pending: allMessages['clientSignup.pending'],
    fieldError: allMessages['clientSignup.fieldError'],
    signedIn: allMessages['clientSignup.signedIn'],
  };
  const selectedCountry =
    phoneCountries.find((option) => option.code === country) ??
    phoneCountries.find((option) => option.code === 'EG');

  useEffect(() => {
    if (!submitted) return;
    if (result.status === 'invalid_input' && result.invalidFields?.length) {
      const firstInvalid = (
        ['name', 'email', 'phone', 'password'] as const
      ).find((field) => result.invalidFields?.includes(field));
      const fieldRef = {
        name: nameRef,
        email: emailRef,
        phone: phoneRef,
        password: passwordRef,
      } as const;
      if (firstInvalid) fieldRef[firstInvalid].current?.focus();
      return;
    }
    resultRef.current?.focus();
  }, [result, submitted]);

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
          ref={nameRef}
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
            {messages.fieldError}
          </span>
        )}
      </label>
      <label className={styles.field}>
        <span>{messages.email}</span>
        <input
          ref={emailRef}
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
            {messages.fieldError}
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
              ref={phoneRef}
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
              {messages.fieldError}
            </span>
          )}
        </label>
      </div>
      <label className={styles.field}>
        <span>{messages.password}</span>
        <input
          ref={passwordRef}
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
            {messages.fieldError}
          </span>
        )}
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? messages.pending : messages.submit}
      </Button>
      {submitted && (
        <p
          ref={resultRef}
          tabIndex={-1}
          role={
            pending
              ? 'status'
              : result.status === 'invalid_input'
                ? 'alert'
                : 'status'
          }
          className={styles.message}
          aria-live="polite"
        >
          {pending ? messages.pending : result.message}
        </p>
      )}
    </form>
  );
}

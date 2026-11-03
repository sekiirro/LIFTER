'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Bidi } from '../../../components/ui/Bidi';
import glass from '../../../components/branding/liquid-glass.module.css';
import heroStyles from '../../../components/branding/registration-hero.module.css';
import { PHONE_NUMBER_GROUP_DIRECTION } from '../../../components/branding/registration-hero';
import {
  runSignupActionSafely,
  signupResult,
  type SignupLocale,
  type SignupPublicResult,
} from '../../../lib/client-accounts/results';
import type { PhoneCountryOption } from '../../../lib/client-accounts/phone';
import { getMessages } from '../../../lib/i18n';
import { parseSignupIdentity, type SignupIdentityField } from './schema';
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

export async function runValidatedSignupAction(
  action: SignupAction,
  previous: SignupPublicResult,
  formData: FormData,
  locale: SignupLocale,
): Promise<SignupPublicResult> {
  const validation = parseSignupIdentity(formData);
  if (!validation.value) return signupResult('invalid_input', locale);
  return runSignupActionSafely(action, previous, formData, locale);
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
        return await runValidatedSignupAction(
          action,
          previous,
          formData,
          locale,
        );
      } finally {
        submittingRef.current = false;
      }
    },
    signupResult('invalid_input', locale),
  );
  const [country, setCountry] = useState('EG');
  const [nationalNumber, setNationalNumber] = useState('');
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [username, setUsername] = useState('');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [touchedIdentityFields, setTouchedIdentityFields] = useState<
    SignupIdentityField[]
  >([]);
  const [identityInvalidFields, setIdentityInvalidFields] = useState<
    SignupIdentityField[]
  >([]);
  const [identityFocusRequest, setIdentityFocusRequest] = useState(0);
  const focusIdentityErrorAfterRenderRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const dateOfBirthRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const telegramUsernameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const allMessages = getMessages(locale);
  const messages = {
    name: allMessages['clientSignup.name'],
    dateOfBirth: allMessages['clientSignup.dateOfBirth'],
    username: allMessages['clientSignup.username'],
    telegramUsername: allMessages['clientSignup.telegramUsername'],
    optional: allMessages['clientSignup.optional'],
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

  function validateTouchedField(field: SignupIdentityField) {
    if (!formRef.current) return;
    const validation = parseSignupIdentity(new FormData(formRef.current));
    setIdentityInvalidFields((current) =>
      validation.invalidFields.includes(field)
        ? [...new Set([...current, field])]
        : current.filter((candidate) => candidate !== field),
    );
  }

  function blurIdentityField(field: SignupIdentityField) {
    setTouchedIdentityFields((current) =>
      current.includes(field) ? current : [...current, field],
    );
    validateTouchedField(field);
  }

  function changeIdentityField(field: SignupIdentityField) {
    if (touchedIdentityFields.includes(field)) validateTouchedField(field);
  }

  useEffect(() => {
    if (!submitted) return;
    const firstIdentityError = (
      ['name', 'dateOfBirth', 'username', 'telegramUsername'] as const
    ).find((field) => identityInvalidFields.includes(field));
    if (firstIdentityError) {
      const identityRefs = {
        name: nameRef,
        dateOfBirth: dateOfBirthRef,
        username: usernameRef,
        telegramUsername: telegramUsernameRef,
      } as const;
      if (focusIdentityErrorAfterRenderRef.current) {
        focusIdentityErrorAfterRenderRef.current = false;
        identityRefs[firstIdentityError].current?.focus();
        return;
      }
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        formRef.current?.contains(activeElement) &&
        activeElement !== formRef.current.querySelector('button[type="submit"]')
      )
        return;
      identityRefs[firstIdentityError].current?.focus();
      return;
    }
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
  }, [identityFocusRequest, identityInvalidFields, result, submitted]);

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
      className={`${styles.form} ${heroStyles.form}`}
      onSubmit={(event) => {
        if (submittingRef.current) {
          event.preventDefault();
          return;
        }
        const validation = parseSignupIdentity(
          new FormData(event.currentTarget),
        );
        if (!validation.value) {
          event.preventDefault();
          const firstIdentityError = (
            ['name', 'dateOfBirth', 'username', 'telegramUsername'] as const
          ).find((field) => validation.invalidFields.includes(field));
          if (firstIdentityError) {
            focusIdentityErrorAfterRenderRef.current = true;
            setIdentityFocusRequest((request) => request + 1);
          }
          setSubmitted(true);
          setTouchedIdentityFields([
            'name',
            'dateOfBirth',
            'username',
            'telegramUsername',
          ]);
          setIdentityInvalidFields(validation.invalidFields);
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
      <label className={`${styles.field} ${heroStyles.field}`}>
        <span>{messages.name}</span>
        <span
          className={`${heroStyles.fieldControl} ${glass.liquidGlassEdge}`}
          data-error={
            (submitted || touchedIdentityFields.includes('name')) &&
            (identityInvalidFields.includes('name') ||
              result.invalidFields?.includes('name'))
              ? 'true'
              : undefined
          }
        >
          <input
            ref={nameRef}
            name="name"
            aria-label={messages.name}
            aria-describedby={
              (submitted || touchedIdentityFields.includes('name')) &&
              (identityInvalidFields.includes('name') ||
                result.invalidFields?.includes('name'))
                ? 'signup-name-error'
                : undefined
            }
            type="text"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            autoComplete="name"
            required
            disabled={pending}
            onBlur={() => blurIdentityField('name')}
            aria-invalid={
              (submitted || touchedIdentityFields.includes('name')) &&
              (identityInvalidFields.includes('name') ||
                result.invalidFields?.includes('name'))
            }
          />
        </span>
        {(submitted || touchedIdentityFields.includes('name')) &&
          (identityInvalidFields.includes('name') ||
            result.invalidFields?.includes('name')) && (
            <span
              id="signup-name-error"
              className={`${styles.fieldError} ${heroStyles.fieldError}`}
            >
              {messages.fieldError}
            </span>
          )}
      </label>
      <label className={`${styles.field} ${heroStyles.field}`}>
        <span>{messages.dateOfBirth}</span>
        <span
          className={`${heroStyles.fieldControl} ${glass.liquidGlassEdge}`}
          data-error={
            identityInvalidFields.includes('dateOfBirth') ? 'true' : undefined
          }
        >
          <input
            ref={dateOfBirthRef}
            name="dateOfBirth"
            aria-label={messages.dateOfBirth}
            aria-describedby={
              (submitted || touchedIdentityFields.includes('dateOfBirth')) &&
              identityInvalidFields.includes('dateOfBirth')
                ? 'signup-date-of-birth-error'
                : undefined
            }
            type="date"
            autoComplete="bday"
            value={dateOfBirth}
            onChange={(event) => {
              setDateOfBirth(event.currentTarget.value);
              changeIdentityField('dateOfBirth');
            }}
            onBlur={() => blurIdentityField('dateOfBirth')}
            required
            disabled={pending}
            aria-invalid={
              (submitted || touchedIdentityFields.includes('dateOfBirth')) &&
              identityInvalidFields.includes('dateOfBirth')
            }
          />
        </span>
        {(submitted || touchedIdentityFields.includes('dateOfBirth')) &&
          identityInvalidFields.includes('dateOfBirth') && (
            <span
              id="signup-date-of-birth-error"
              className={`${styles.fieldError} ${heroStyles.fieldError}`}
            >
              {messages.fieldError}
            </span>
          )}
      </label>
      <label className={`${styles.field} ${heroStyles.field}`}>
        <span>{messages.username}</span>
        <span
          className={`${heroStyles.fieldControl} ${glass.liquidGlassEdge}`}
          data-error={
            identityInvalidFields.includes('username') ? 'true' : undefined
          }
        >
          <input
            ref={usernameRef}
            name="username"
            aria-label={messages.username}
            aria-describedby={
              (submitted || touchedIdentityFields.includes('username')) &&
              identityInvalidFields.includes('username')
                ? 'signup-username-error'
                : undefined
            }
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => {
              setUsername(event.currentTarget.value);
              changeIdentityField('username');
            }}
            onBlur={() => blurIdentityField('username')}
            required
            disabled={pending}
            aria-invalid={
              (submitted || touchedIdentityFields.includes('username')) &&
              identityInvalidFields.includes('username')
            }
          />
        </span>
        {(submitted || touchedIdentityFields.includes('username')) &&
          identityInvalidFields.includes('username') && (
            <span
              id="signup-username-error"
              className={`${styles.fieldError} ${heroStyles.fieldError}`}
            >
              {messages.fieldError}
            </span>
          )}
      </label>
      <label className={`${styles.field} ${heroStyles.field}`}>
        <span>
          {messages.telegramUsername} ({messages.optional})
        </span>
        <span
          className={`${heroStyles.fieldControl} ${glass.liquidGlassEdge}`}
          data-error={
            identityInvalidFields.includes('telegramUsername')
              ? 'true'
              : undefined
          }
        >
          <input
            ref={telegramUsernameRef}
            name="telegramUsername"
            aria-label={`${messages.telegramUsername} (${messages.optional})`}
            aria-describedby={
              (submitted ||
                touchedIdentityFields.includes('telegramUsername')) &&
              identityInvalidFields.includes('telegramUsername')
                ? 'signup-telegram-error'
                : undefined
            }
            type="text"
            autoComplete="off"
            value={telegramUsername}
            onChange={(event) => {
              setTelegramUsername(event.currentTarget.value);
              changeIdentityField('telegramUsername');
            }}
            onBlur={() => blurIdentityField('telegramUsername')}
            disabled={pending}
            aria-invalid={
              (submitted ||
                touchedIdentityFields.includes('telegramUsername')) &&
              identityInvalidFields.includes('telegramUsername')
            }
          />
        </span>
        {(submitted || touchedIdentityFields.includes('telegramUsername')) &&
          identityInvalidFields.includes('telegramUsername') && (
            <span
              id="signup-telegram-error"
              className={`${styles.fieldError} ${heroStyles.fieldError}`}
            >
              {messages.fieldError}
            </span>
          )}
      </label>
      <label className={`${styles.field} ${heroStyles.field}`}>
        <span>{messages.email}</span>
        <span
          className={`${heroStyles.fieldControl} ${glass.liquidGlassEdge}`}
          data-error={
            submitted && result.invalidFields?.includes('email')
              ? 'true'
              : undefined
          }
        >
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
        </span>
        {submitted && result.invalidFields?.includes('email') && (
          <span
            id="signup-email-error"
            className={`${styles.fieldError} ${heroStyles.fieldError}`}
          >
            {messages.fieldError}
          </span>
        )}
      </label>
      <div className={`${styles.phoneFields} ${heroStyles.phoneFields}`}>
        <label className={`${styles.field} ${heroStyles.field}`}>
          <span>{messages.country}</span>
          <span
            className={`${heroStyles.countryPicker} ${glass.liquidGlassEdge}`}
          >
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
          </span>
        </label>
        <label className={`${styles.field} ${heroStyles.field}`}>
          <span>{messages.phone}</span>
          <span
            className={`${styles.phoneNumber} ${heroStyles.phoneNumber} ${heroStyles.fieldControl} ${glass.liquidGlassEdge}`}
            data-testid="phone-number-group"
            dir={PHONE_NUMBER_GROUP_DIRECTION}
            data-error={
              submitted && result.invalidFields?.includes('phone')
                ? 'true'
                : undefined
            }
          >
            <span aria-hidden="true" data-testid="country-calling-code">
              <Bidi dir="ltr">+{selectedCountry?.callingCode ?? '20'}</Bidi>
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
            <span
              id="signup-phone-error"
              className={`${styles.fieldError} ${heroStyles.fieldError}`}
            >
              {messages.fieldError}
            </span>
          )}
        </label>
      </div>
      <label className={`${styles.field} ${heroStyles.field}`}>
        <span>{messages.password}</span>
        <span
          className={`${heroStyles.fieldControl} ${glass.liquidGlassEdge}`}
          data-error={
            submitted && result.invalidFields?.includes('password')
              ? 'true'
              : undefined
          }
        >
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
            aria-invalid={
              submitted && result.invalidFields?.includes('password')
            }
          />
        </span>
        {submitted && result.invalidFields?.includes('password') && (
          <span
            id="signup-password-error"
            className={`${styles.fieldError} ${heroStyles.fieldError}`}
          >
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
          className={`${styles.message} ${heroStyles.message}`}
          data-result-status={result.status}
          aria-live="polite"
        >
          {pending ? messages.pending : result.message}
        </p>
      )}
    </form>
  );
}

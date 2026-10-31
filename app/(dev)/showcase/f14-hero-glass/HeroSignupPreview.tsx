'use client';

import {
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../../../components/ui/Button';
import { Bidi } from '../../../../components/ui/Bidi';
import type { SignupLocale } from '../../../../lib/client-accounts/results';
import type { PhoneCountryOption } from '../../../../lib/client-accounts/phone';
import { getMessages } from '../../../../lib/i18n';
import styles from '../../../register/[token]/signup.module.css';
import prototypeStyles from './page.module.css';
import glass from './liquid-glass.module.css';

type PreviewPhoneValidator = (
  country: string,
  nationalNumber: string,
) => Promise<string | null>;

export function HeroSignupPreview({
  locale,
  phoneCountries,
  validatePreviewPhone,
}: {
  locale: SignupLocale;
  phoneCountries: PhoneCountryOption[];
  validatePreviewPhone: PreviewPhoneValidator;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const countryPickerRef = useRef<HTMLDivElement>(null);
  const [country, setCountry] = useState('EG');
  const [nationalNumber, setNationalNumber] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [countryListPlacement, setCountryListPlacement] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    above: boolean;
  } | null>(null);
  const [phoneError, setPhoneError] = useState(false);
  const [pending, setPending] = useState(false);
  const [validatedPhone, setValidatedPhone] = useState('');
  const messages = getMessages(locale);
  const selectedCountry =
    phoneCountries.find((option) => option.code === country) ??
    phoneCountries.find((option) => option.code === 'EG');
  const countryName = selectedCountry?.name ?? 'Egypt';
  const search = countryQuery.normalize('NFKC').toLocaleLowerCase(locale);
  const filteredCountries = useMemo(() => {
    const matching = phoneCountries.filter((option) =>
      option.name.normalize('NFKC').toLocaleLowerCase(locale).includes(search),
    );
    if (search) return matching;
    return matching.sort((left, right) => {
      if (left.code === selectedCountry?.code) return -1;
      if (right.code === selectedCountry?.code) return 1;
      return 0;
    });
  }, [locale, phoneCountries, search, selectedCountry?.code]);
  const optionsId = 'hero-country-options';

  function openCountryList() {
    setCountryOpen(true);
  }

  useLayoutEffect(() => {
    if (!countryOpen) return;
    const pickerBounds = countryPickerRef.current?.getBoundingClientRect();
    if (!pickerBounds) return;
    const gap = 8;
    const viewportWidth = Math.min(
      document.documentElement.clientWidth,
      window.visualViewport?.width ?? window.innerWidth,
    );
    const desiredHeight = Math.min(224, filteredCountries.length * 48 + 8);
    const below = Math.max(0, window.innerHeight - pickerBounds.bottom - gap);
    const above = Math.max(0, pickerBounds.top - gap);
    const opensAbove = below < desiredHeight && above > below;
    const available = opensAbove ? above : below;
    const maxHeight = Math.max(96, Math.min(desiredHeight, available));
    const width = Math.min(pickerBounds.width, viewportWidth - gap * 2);
    const left = Math.max(
      gap,
      Math.min(pickerBounds.left, viewportWidth - width - gap),
    );
    const top = opensAbove
      ? Math.max(gap, pickerBounds.top - maxHeight - gap)
      : Math.min(
          window.innerHeight - maxHeight - gap,
          pickerBounds.bottom + gap,
        );
    setCountryListPlacement({
      top,
      left,
      width,
      maxHeight,
      above: opensAbove,
    });
  }, [countryOpen, filteredCountries.length]);

  useEffect(() => {
    const preview = formRef.current?.closest<HTMLElement>(
      '[data-testid="hero-signup-preview"]',
    );
    if (preview) preview.dataset.hydrated = 'true';
  }, []);

  function chooseCountry(option: PhoneCountryOption) {
    setCountry(option.code);
    setCountryQuery('');
    setCountryOpen(false);
    setCountryListPlacement(null);
    setActiveIndex(0);
    setPhoneError(false);
    setValidatedPhone('');
  }

  function onCountryKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!countryOpen) {
        setCountryQuery('');
        openCountryList();
        setActiveIndex(0);
      } else {
        setActiveIndex((current) =>
          Math.min(current + 1, filteredCountries.length - 1),
        );
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!countryOpen) {
        setCountryQuery('');
        openCountryList();
        setActiveIndex(0);
      } else {
        setActiveIndex((current) => Math.max(current - 1, 0));
      }
      return;
    }
    if (
      event.key === 'Enter' &&
      countryOpen &&
      filteredCountries[activeIndex]
    ) {
      event.preventDefault();
      chooseCountry(filteredCountries[activeIndex]!);
      return;
    }
    if (event.key === 'Escape' && countryOpen) {
      event.preventDefault();
      setCountryOpen(false);
      setCountryListPlacement(null);
      setCountryQuery('');
      setActiveIndex(0);
    }
  }

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setPhoneError(false);
    setValidatedPhone('');
    try {
      const value = await validatePreviewPhone(country, nationalNumber);
      if (!value) {
        setPhoneError(true);
        formRef.current
          ?.querySelector<HTMLInputElement>('[name="phone-national"]')
          ?.focus();
      } else {
        setValidatedPhone(value);
        if (formRef.current) formRef.current.dataset.validatedPhone = value;
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="hero-signup-preview" data-testid="hero-signup-preview">
      <form
        ref={formRef}
        className={styles.form}
        onSubmit={submitPreview}
        noValidate
        data-validated-phone={validatedPhone || undefined}
      >
        <label className={styles.field}>
          <span>{messages['clientSignup.name']}</span>
          <span
            className={`${prototypeStyles.fieldControl} ${glass.liquidGlassEdge}`}
          >
            <input
              name="name"
              type="text"
              autoComplete="name"
              required
              disabled={pending}
            />
          </span>
        </label>
        <label className={styles.field}>
          <span>{messages['clientSignup.email']}</span>
          <span
            className={`${prototypeStyles.fieldControl} ${glass.liquidGlassEdge}`}
          >
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={pending}
            />
          </span>
        </label>
        <div className={styles.phoneFields}>
          <div className={`${styles.field} ${prototypeStyles.countryField}`}>
            <label htmlFor="hero-country-input">
              {messages['clientSignup.country']}
            </label>
            <div
              ref={countryPickerRef}
              className={`${prototypeStyles.countryPicker} ${glass.liquidGlassEdge}`}
              dir={locale === 'ar' ? 'rtl' : 'ltr'}
            >
              <input
                id="hero-country-input"
                role="combobox"
                aria-label={messages['clientSignup.country']}
                aria-autocomplete="list"
                aria-expanded={countryOpen}
                aria-controls={optionsId}
                aria-activedescendant={
                  countryOpen
                    ? `${optionsId}-${filteredCountries[activeIndex]?.code}`
                    : undefined
                }
                autoComplete="off"
                value={countryOpen ? countryQuery : countryName}
                onFocus={() => {
                  setCountryQuery('');
                  openCountryList();
                  setActiveIndex(0);
                }}
                onChange={(event) => {
                  setCountryQuery(event.currentTarget.value);
                  openCountryList();
                  setActiveIndex(0);
                }}
                onKeyDown={onCountryKeyDown}
                onBlur={() => {
                  window.setTimeout(() => {
                    setCountryOpen(false);
                    setCountryQuery('');
                  }, 100);
                }}
                disabled={pending}
              />
              {countryOpen &&
                countryListPlacement &&
                typeof document !== 'undefined' &&
                createPortal(
                  <ul
                    id={optionsId}
                    role="listbox"
                    dir={locale === 'ar' ? 'rtl' : 'ltr'}
                    className={`${prototypeStyles.countryList} ${glass.liquidGlassStrong}`}
                    data-testid="country-options"
                    data-no-artwork={
                      document.querySelector('[data-fixture="none"]')
                        ? 'true'
                        : undefined
                    }
                    data-placement={
                      countryListPlacement.above ? 'above' : 'below'
                    }
                    style={{
                      top: countryListPlacement.top,
                      left: countryListPlacement.left,
                      width: countryListPlacement.width,
                      maxHeight: countryListPlacement.maxHeight,
                    }}
                  >
                    {filteredCountries.map((option, index) => (
                      <li
                        id={`${optionsId}-${option.code}`}
                        key={option.code}
                        role="option"
                        aria-selected={option.code === selectedCountry?.code}
                        className={
                          index === activeIndex
                            ? prototypeStyles.activeOption
                            : undefined
                        }
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseMove={() => setActiveIndex(index)}
                        onClick={() => chooseCountry(option)}
                      >
                        <span>{option.name}</span>
                        <Bidi dir="ltr">+{option.callingCode}</Bidi>
                      </li>
                    ))}
                  </ul>,
                  document.querySelector('main') ?? document.body,
                )}
            </div>
          </div>
          <label className={styles.field}>
            <span>{messages['clientSignup.phone']}</span>
            <span
              className={`${styles.phoneNumber} ${prototypeStyles.phoneNumber} ${prototypeStyles.fieldControl} ${glass.liquidGlassEdge}`}
              data-error={phoneError || undefined}
            >
              <span aria-hidden="true" data-testid="country-calling-code">
                <Bidi dir="ltr">+{selectedCountry?.callingCode ?? '20'}</Bidi>
              </span>
              <input
                name="phone-national"
                dir="ltr"
                aria-label={messages['clientSignup.phone']}
                aria-describedby={phoneError ? 'hero-phone-error' : undefined}
                aria-invalid={phoneError || undefined}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                required
                disabled={pending}
                value={nationalNumber}
                onChange={(event) => {
                  setNationalNumber(event.currentTarget.value);
                  setPhoneError(false);
                  setValidatedPhone('');
                }}
              />
            </span>
            {phoneError && (
              <span id="hero-phone-error" className={styles.fieldError}>
                {messages['clientSignup.fieldError']}
              </span>
            )}
          </label>
        </div>
        <label className={styles.field}>
          <span>{messages['clientSignup.password']}</span>
          <span
            className={`${prototypeStyles.fieldControl} ${glass.liquidGlassEdge}`}
          >
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              disabled={pending}
            />
          </span>
        </label>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending
            ? messages['clientSignup.pending']
            : messages['clientSignup.submit']}
        </Button>
        {validatedPhone && (
          <p
            role="status"
            className={prototypeStyles.srOnly}
            data-testid="phone-e164-preview"
          >
            {validatedPhone}
          </p>
        )}
      </form>
    </div>
  );
}

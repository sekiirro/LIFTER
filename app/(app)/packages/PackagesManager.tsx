'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '../../../components/ui/Field';
import { Button } from '../../../components/ui/Button';
import { Alert } from '../../../components/ui/Alert';
import { EmptyState, Skeleton } from '../../../components/ui/States';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { getMessages } from '../../../lib/i18n';
import {
  categoryLabel,
  marketLabel,
  typeLabel,
} from '../../../lib/packages/category-label';
import { tierLabel } from '../../../lib/packages/tier-label';
import type { Locale } from '../../../lib/design/preferences';
import type {
  PackageIdentity,
  PackageOffer,
  PackageReadResult,
} from '../../../lib/packages/read';
import {
  formatCommission,
  formatMinorUnits,
} from '../../../lib/packages/money';
import {
  allowedCurrenciesForMarket,
  isCurrencyAllowedForMarket,
  isPackageMarket,
  isPackageType,
  PACKAGE_MARKETS,
  PACKAGE_TYPES,
  PRESET_MONTHS,
  TIER_RANKS,
  type PackageMarket,
  type PackageType,
} from '../../../lib/packages/validation';
import {
  createPackageCategory,
  publishPackageVersion,
  setPackageOfferAvailable,
} from './actions';
import styles from './packages.module.css';

type Props = {
  locale: Locale;
  workspaceId: string;
  workspaces: { id: string; name: string }[];
  data: Extract<PackageReadResult, { status: 'ok' }>;
};

function formatPackageName(
  pkg: PackageIdentity | undefined,
  locale: Locale,
  fallback: string,
): string {
  if (pkg && isPackageMarket(pkg.market) && isPackageType(pkg.type)) {
    return categoryLabel(pkg.market, pkg.type, locale);
  }
  return pkg?.code ?? fallback;
}

export function PackagesManager({
  locale,
  workspaceId,
  workspaces,
  data,
}: Props) {
  const m = getMessages(locale);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [switching, setSwitching] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  const currencyId = useId();
  const [message, setMessage] = useState<
    'saved' | 'denied' | 'invalid_input' | 'unavailable' | null
  >(null);
  const [market, setMarket] = useState<PackageMarket | null>(null);
  const [categoryType, setCategoryType] = useState<PackageType | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [currencyValue, setCurrencyValue] = useState('');
  const [months, setMonths] = useState<number | 'custom' | null>(null);
  const [tierRank, setTierRank] = useState<(typeof TIER_RANKS)[number] | null>(
    null,
  );
  const [currencyError, setCurrencyError] = useState<string | undefined>(
    undefined,
  );
  const [confirm, setConfirm] = useState<PackageOffer | null>(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function run(
    operation: () => Promise<{
      status: 'ok' | 'denied' | 'invalid_input' | 'unavailable';
    }>,
    done?: () => void,
  ) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage(null);
    try {
      const result = await operation();
      if (!active.current) return;
      if (result.status === 'ok') {
        done?.();
        setMessage('saved');
        router.refresh();
      } else setMessage(result.status);
    } catch {
      if (active.current) setMessage('unavailable');
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (market === null || categoryType === null) {
      setMessage('invalid_input');
      return;
    }
    void run(
      () =>
        createPackageCategory({
          workspaceId,
          market,
          type: categoryType,
        }),
      () => {
        setMarket(null);
        setCategoryType(null);
      },
    );
  }

  const packageById = new Map(data.packages.map((p) => [p.id, p]));
  const selectedPackage = packageById.get(selectedPackageId);
  const selectedMarket =
    selectedPackage && isPackageMarket(selectedPackage.market)
      ? selectedPackage.market
      : null;

  function validateCurrencyForSelected(value: string): boolean {
    if (!selectedMarket) return false;
    return isCurrencyAllowedForMarket(selectedMarket, value);
  }

  function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const v = new FormData(form);
    const packageId = String(v.get('packageId') ?? selectedPackageId);
    const targetPkg = packageById.get(packageId);
    const submittedCurrency = String(v.get('currency') ?? currencyValue);
    if (
      !targetPkg ||
      !isPackageMarket(targetPkg.market) ||
      !isCurrencyAllowedForMarket(targetPkg.market, submittedCurrency)
    ) {
      setCurrencyError(m['packages.invalid_input']);
      setMessage('invalid_input');
      document.getElementById(currencyId)?.focus();
      return;
    }
    if (months === null || tierRank === null) {
      setMessage('invalid_input');
      return;
    }
    setCurrencyError(undefined);
    void run(
      () =>
        publishPackageVersion({
          workspaceId,
          packageId,
          tierRank,
          durationMonths: months === 'custom' ? null : months,
          durationDays:
            months === 'custom' ? v.get('durationDays') : months * 30,
          nameAr: v.get('nameAr'),
          nameEn: v.get('nameEn'),
          priceMinor: v.get('priceMinor'),
          currency: submittedCurrency,
          commissionRateBp: v.get('commissionRateBp'),
        }),
      () => {
        form.reset();
        setSelectedPackageId('');
        setCurrencyValue('');
        setMonths(null);
        setTierRank(null);
        setCurrencyError(undefined);
      },
    );
  }

  const current = new Map(data.versions.map((v) => [v.id, v]));
  if (switching)
    return (
      <main className={styles.main} aria-busy="true">
        <p role="status">{m['packages.loading']}</p>
        <Skeleton shape="card" />
      </main>
    );

  return (
    <main className={styles.main}>
      <h1>{m['packages.title']}</h1>
      <label className={styles.stack}>
        {m['packages.workspace']}
        <select
          aria-label={m['packages.workspace']}
          value={workspaceId}
          onChange={(e) => {
            active.current = false;
            setSwitching(true);
            setMessage(null);
            setMarket(null);
            setCategoryType(null);
            setSelectedPackageId('');
            setCurrencyValue('');
            setTierRank(null);
            setMonths(null);
            setCurrencyError(undefined);
            setConfirm(null);
            router.push(
              `/packages?workspace=${encodeURIComponent(e.target.value)}`,
            );
          }}
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      {pending && <p role="status">{m['packages.pending']}</p>}
      {message && (
        <Alert
          tone={message === 'saved' ? 'success' : 'error'}
          title={m[`packages.${message}`]}
        />
      )}
      <section className={styles.card} aria-labelledby="create-heading">
        <h2 id="create-heading">{m['packages.create']}</h2>
        <form onSubmit={create} className={styles.stack}>
          <fieldset disabled={pending} className={styles.categoryFields}>
            <legend className={styles.srOnly}>{m['packages.create']}</legend>
            <div
              className={styles.presets}
              role="group"
              aria-label={`${marketLabel('Egypt', locale)} / ${marketLabel('International', locale)}`}
            >
              {PACKAGE_MARKETS.map((value) => (
                <label
                  key={value}
                  className={styles.choicePill}
                  data-selected={market === value || undefined}
                >
                  <input
                    type="radio"
                    name="market"
                    value={value}
                    required
                    checked={market === value}
                    onChange={() => setMarket(value)}
                  />
                  <span>{marketLabel(value, locale)}</span>
                </label>
              ))}
            </div>
            <div
              className={styles.presets}
              role="group"
              aria-label={`${typeLabel('Year-round', locale)} / ${typeLabel('Promotional', locale)}`}
            >
              {PACKAGE_TYPES.map((value) => (
                <label
                  key={value}
                  className={styles.choicePill}
                  data-selected={categoryType === value || undefined}
                >
                  <input
                    type="radio"
                    name="type"
                    value={value}
                    required
                    checked={categoryType === value}
                    onChange={() => setCategoryType(value)}
                  />
                  <span>{typeLabel(value, locale)}</span>
                </label>
              ))}
            </div>
            <div>
              <Button type="submit" loading={pending}>
                {m['packages.create']}
              </Button>
            </div>
          </fieldset>
        </form>
      </section>
      <section className={styles.card} aria-labelledby="publish-heading">
        <h2 id="publish-heading">{m['packages.publish']}</h2>
        {data.packages.length === 0 ? (
          <EmptyState title={m['packages.emptyCatalog']} />
        ) : (
          <form onSubmit={publish} className={styles.stack}>
            <fieldset disabled={pending} className={styles.fields}>
              <legend className={styles.srOnly}>{m['packages.publish']}</legend>
              <label className={styles.stack}>
                {m['packages.package']}
                <select
                  name="packageId"
                  required
                  value={selectedPackageId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedPackageId(nextId);
                    const nextPkg = packageById.get(nextId);
                    if (
                      currencyError &&
                      (!currencyValue ||
                        (nextPkg &&
                          isPackageMarket(nextPkg.market) &&
                          isCurrencyAllowedForMarket(
                            nextPkg.market,
                            currencyValue,
                          )))
                    ) {
                      setCurrencyError(undefined);
                    }
                  }}
                >
                  <option value="" disabled>
                    {m['packages.select']}
                  </option>
                  {data.packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatPackageName(p, locale, p.id)}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.presets}>
                {TIER_RANKS.map((rank) => (
                  <label
                    key={rank}
                    className={styles.choicePill}
                    data-selected={tierRank === rank || undefined}
                  >
                    <input
                      type="radio"
                      name="tierRank"
                      value={rank}
                      required
                      checked={tierRank === rank}
                      onChange={() => setTierRank(rank)}
                    />
                    <span>{tierLabel(rank, locale)}</span>
                  </label>
                ))}
              </div>
              <div className={styles.stack}>
                <p id="duration-label">{m['packages.duration']}</p>
                <div
                  className={styles.presets}
                  role="group"
                  aria-labelledby="duration-label"
                >
                  {PRESET_MONTHS.map((n) => (
                    <Button
                      key={n}
                      variant="secondary"
                      aria-pressed={months === n}
                      onClick={() => setMonths(n)}
                    >
                      {n} {m['packages.months']}
                    </Button>
                  ))}
                  <Button
                    variant="secondary"
                    aria-pressed={months === 'custom'}
                    onClick={() => setMonths('custom')}
                  >
                    {m['packages.custom']}
                  </Button>
                </div>
                {months === 'custom' && (
                  <Field
                    label={m['packages.days']}
                    inputProps={{
                      name: 'durationDays',
                      required: true,
                      inputMode: 'numeric',
                      pattern: '[0-9]+',
                    }}
                  />
                )}
              </div>
              <Field
                label={m['packages.nameAr']}
                inputProps={{
                  name: 'nameAr',
                  required: true,
                  dir: 'rtl',
                  lang: 'ar',
                }}
              />
              <Field
                label={m['packages.nameEn']}
                inputProps={{
                  name: 'nameEn',
                  required: true,
                  dir: 'ltr',
                  lang: 'en',
                }}
              />
              <Field
                label={m['packages.priceMinor']}
                inputProps={{
                  name: 'priceMinor',
                  required: true,
                  inputMode: 'numeric',
                  pattern: '[0-9]+',
                  dir: 'ltr',
                }}
              />
              <Field
                label={m['packages.currency']}
                hint={
                  selectedMarket
                    ? allowedCurrenciesForMarket(selectedMarket).join(' · ')
                    : undefined
                }
                error={currencyError}
                inputProps={{
                  id: currencyId,
                  name: 'currency',
                  required: true,
                  pattern: '[A-Z]{3}',
                  dir: 'ltr',
                  value: currencyValue,
                  onBlur: (e) => {
                    const value = e.currentTarget.value;
                    if (
                      value &&
                      selectedMarket &&
                      !validateCurrencyForSelected(value)
                    ) {
                      setCurrencyError(m['packages.invalid_input']);
                    }
                  },
                  onChange: (e) => {
                    const value = e.currentTarget.value;
                    setCurrencyValue(value);
                    if (
                      currencyError &&
                      (!value || validateCurrencyForSelected(value))
                    ) {
                      setCurrencyError(undefined);
                    }
                  },
                }}
              />
              <Field
                label={m['packages.rateBp']}
                inputProps={{
                  name: 'commissionRateBp',
                  required: true,
                  inputMode: 'numeric',
                  pattern: '[0-9]+',
                  dir: 'ltr',
                }}
              />
              <div className={styles.submitRow}>
                <Button type="submit" loading={pending}>
                  {m['packages.publish']}
                </Button>
              </div>
            </fieldset>
          </form>
        )}
      </section>
      {data.offers.length === 0 ? (
        <EmptyState title={m['packages.empty']} />
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <caption>{m['packages.title']}</caption>
            <thead>
              <tr>
                {(
                  [
                    'package',
                    'duration',
                    'version',
                    'price',
                    'rate',
                    'availability',
                  ] as const
                ).map((key) => (
                  <th scope="col" key={key}>
                    {m[`packages.${key}`]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.offers.map((offer) => {
                const v = current.get(offer.current_version_id ?? '');
                const pkg = packageById.get(offer.package_id);
                const pkgLabel =
                  v && isPackageMarket(v.market) && isPackageType(v.type)
                    ? categoryLabel(v.market, v.type, locale)
                    : formatPackageName(pkg, locale, offer.package_id);
                const available = offer.available;
                return (
                  <tr key={offer.id}>
                    <th scope="row">
                      <bdi>{pkgLabel}</bdi>
                      {' · '}
                      {tierLabel(offer.tier_rank, locale)}
                      {v && (
                        <p className={styles.authored}>
                          {locale === 'ar' ? v.name_ar : v.name_en}
                        </p>
                      )}
                    </th>
                    <td className={styles.numeric}>
                      {m['packages.days']}: {offer.duration_days}
                    </td>
                    <td className={styles.numeric}>{v?.version}</td>
                    <td className={styles.numeric}>
                      {v && (
                        <bdi>
                          {formatMinorUnits(v.price_minor, v.currency, locale)}
                        </bdi>
                      )}
                    </td>
                    <td className={styles.numeric}>
                      {v?.commission_rate_bp !== undefined && (
                        <bdi>
                          {formatCommission(v.commission_rate_bp, locale)}
                        </bdi>
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          available
                            ? styles.statusAvailable
                            : styles.statusUnavailable
                        }
                      >
                        {available
                          ? m['packages.available']
                          : m['packages.unavailableOffer']}
                      </span>
                      <Button
                        disabled={pending}
                        variant="secondary"
                        onClick={() => setConfirm({ ...offer, available })}
                      >
                        {available
                          ? m['packages.disable']
                          : m['packages.enable']}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={m['packages.confirmTitle']}
        description={
          confirm
            ? `${workspaces.find((w) => w.id === workspaceId)?.name} / ${formatPackageName(packageById.get(confirm.package_id), locale, confirm.package_id)} / ${m['packages.days']}: ${confirm.duration_days} / ${confirm.available ? m['packages.disable'] : m['packages.enable']}`
            : undefined
        }
        confirmLabel={m['packages.confirm']}
        cancelLabel={m['packages.cancel']}
        loading={pending}
        onCancel={() => {
          if (!busy.current) setConfirm(null);
        }}
        onConfirm={() => {
          if (!confirm) return;
          const target = confirm;
          void run(() =>
            setPackageOfferAvailable({
              workspaceId,
              offerId: target.id,
              available: !target.available,
            }).finally(() => setConfirm(null)),
          );
        }}
      />
    </main>
  );
}

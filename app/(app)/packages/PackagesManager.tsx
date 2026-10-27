'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '../../../components/ui/Field';
import { Button } from '../../../components/ui/Button';
import { Alert } from '../../../components/ui/Alert';
import { EmptyState, Skeleton } from '../../../components/ui/States';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { getMessages } from '../../../lib/i18n';
import type { Locale } from '../../../lib/design/preferences';
import type {
  PackageReadResult,
  PackageOffer,
} from '../../../lib/packages/read';
import {
  formatMinorUnits,
  formatCommission,
} from '../../../lib/packages/money';
import { PRESET_MONTHS } from '../../../lib/packages/validation';
import {
  createPackage,
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
  const [message, setMessage] = useState<
    'saved' | 'denied' | 'invalid_input' | 'unavailable' | null
  >(null);
  const [months, setMonths] = useState<number | 'custom' | null>(null);
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
    const form = event.currentTarget;
    const values = new FormData(form);
    void run(
      () => createPackage({ workspaceId, code: values.get('code') }),
      () => form.reset(),
    );
  }
  function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (months === null) {
      setMessage('invalid_input');
      return;
    }
    const form = event.currentTarget;
    const v = new FormData(form);
    void run(
      () =>
        publishPackageVersion({
          workspaceId,
          packageId: v.get('packageId'),
          durationMonths: months === 'custom' ? null : months,
          durationDays:
            months === 'custom' ? v.get('durationDays') : months * 30,
          nameAr: v.get('nameAr'),
          nameEn: v.get('nameEn'),
          priceMinor: v.get('priceMinor'),
          currency: v.get('currency'),
          commissionRateBp: v.get('commissionRateBp'),
        }),
      () => {
        form.reset();
        setMonths(null);
      },
    );
  }
  const current = new Map(data.versions.map((v) => [v.id, v]));
  const codes = new Map(data.packages.map((p) => [p.id, p.code]));
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
      <section className={styles.stack} aria-labelledby="create-heading">
        <h2 id="create-heading">{m['packages.create']}</h2>
        <form onSubmit={create} className={styles.stack}>
          <fieldset disabled={pending} className={styles.fields}>
            <Field
              label={m['packages.code']}
              inputProps={{
                name: 'code',
                required: true,
                pattern: '[a-z0-9]+(-[a-z0-9]+)*',
                dir: 'ltr',
              }}
            />
            <Button type="submit" loading={pending}>
              {m['packages.create']}
            </Button>
          </fieldset>
        </form>
      </section>
      <section className={styles.stack} aria-labelledby="publish-heading">
        <h2 id="publish-heading">{m['packages.publish']}</h2>
        {data.packages.length === 0 ? (
          <EmptyState title={m['packages.emptyCatalog']} />
        ) : (
          <form onSubmit={publish} className={styles.stack}>
            <fieldset disabled={pending} className={styles.fields}>
              <label className={styles.stack}>
                {m['packages.package']}
                <select name="packageId" required defaultValue="">
                  <option value="" disabled>
                    {m['packages.select']}
                  </option>
                  {data.packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code}
                    </option>
                  ))}
                </select>
              </label>
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
                inputProps={{
                  name: 'currency',
                  required: true,
                  pattern: '[A-Z]{3}',
                  dir: 'ltr',
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
              <Button type="submit" loading={pending}>
                {m['packages.publish']}
              </Button>
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
                {[
                  'code',
                  'duration',
                  'version',
                  'price',
                  'rate',
                  'availability',
                ].map((key) => (
                  <th scope="col" key={key}>
                    {m[`packages.${key}` as keyof typeof m]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.offers.map((offer) => {
                const v = current.get(offer.current_version_id ?? '');
                const available = offer.available;
                return (
                  <tr key={offer.id}>
                    <th scope="row">
                      <bdi>{codes.get(offer.package_id)}</bdi>
                      {v && <p>{locale === 'ar' ? v.name_ar : v.name_en}</p>}
                    </th>
                    <td>
                      {offer.duration_days} {m['packages.days']}
                    </td>
                    <td>{v?.version}</td>
                    <td>
                      {v && (
                        <bdi>
                          {formatMinorUnits(v.price_minor, v.currency, locale)}
                        </bdi>
                      )}
                    </td>
                    <td>
                      {v?.commission_rate_bp !== undefined && (
                        <bdi>
                          {formatCommission(v.commission_rate_bp, locale)}
                        </bdi>
                      )}
                    </td>
                    <td>
                      <span>
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
            ? `${workspaces.find((w) => w.id === workspaceId)?.name} / ${codes.get(confirm.package_id)} / ${confirm.duration_days} ${m['packages.days']} / ${confirm.available ? m['packages.disable'] : m['packages.enable']}`
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
          void run(
            () =>
              setPackageOfferAvailable({
                workspaceId,
                offerId: target.id,
                available: !target.available,
              }),
            () => {
              setConfirm(null);
            },
          );
        }}
      />
    </main>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { EmptyState } from '../../../components/ui/States';
import { Button } from '../../../components/ui/Button';
import { formatMinorUnits } from '../../../lib/packages/money';
import type { Messages } from '../../../lib/i18n';
import styles from './reports.module.css';

export type ReportPackage = {
  id: string;
  market: string | null;
  type: string | null;
};
type Collection = {
  id: string;
  package: ReportPackage | null;
  clientName: string | null;
  recordedAt: string;
  amountMinor: string;
  currency: string;
  convertedEgpExact: string | null;
};
type Commission = {
  package: ReportPackage | null;
  byCurrency: Record<string, string>;
  convertedEgpExact: string | null;
  pendingRateCount: number;
};
type Installment = {
  id: string;
  package: ReportPackage | null;
  clientName: string | null;
  dueOn: string | null;
  amountMinor: string;
  paidMinor: string;
  remainingMinor: string;
  currency: string;
  isInstallmentClient: boolean;
};

export type ReportsData = {
  collections:
    | {
        status: 'ok';
        rows: Collection[];
        totalConvertedEgpMinor: string;
        pendingEventIds: string[];
      }
    | { status: 'error' };
  commissions: { status: 'ok'; rows: Commission[] } | { status: 'error' };
  installments: { status: 'ok'; rows: Installment[] } | { status: 'error' };
};

export function packageLabel(item: ReportPackage | null, locale: 'ar' | 'en') {
  if (!item) return '—';
  const markets: Record<string, { en: string; ar: string }> = {
    Egypt: { en: 'Egypt', ar: 'مصر' },
    International: { en: 'International', ar: 'دولي' },
  };
  const types: Record<string, { en: string; ar: string }> = {
    Promotional: { en: 'Promotional', ar: 'وقت العـروض' },
    'Year-Round': { en: 'Year-Round', ar: 'طول السنـة' },
    'Year-round': { en: 'Year-Round', ar: 'طول السنـة' },
  };
  const market = item.market ? markets[item.market]?.[locale] : undefined;
  const type = item.type ? types[item.type]?.[locale] : undefined;
  return market && type ? `${market} · ${type}` : '—';
}

function cairoDate(value: string, locale: 'ar' | 'en') {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'medium',
  }).format(new Date(value));
}

function exactAmount(value: string, currency: string, locale: 'ar' | 'en') {
  if (value === '0') {
    const numberLocale = locale === 'ar' ? 'ar-EG' : 'en';
    const places =
      new Intl.NumberFormat('en', {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2;
    const integer = new Intl.NumberFormat(numberLocale, {
      maximumFractionDigits: 0,
    }).format(0n);
    const separator =
      new Intl.NumberFormat(numberLocale)
        .formatToParts(1.1)
        .find((part) => part.type === 'decimal')?.value ?? '.';
    const zeros = locale === 'ar' ? '٠'.repeat(places) : '0'.repeat(places);
    const amount = `${integer}${places ? `${separator}${zeros}` : ''} ${currency}`;
    return locale === 'ar' ? `\u2068${amount}\u2069` : amount;
  }
  return formatMinorUnits(value, currency, locale);
}

function exactConvertedAmount(value: string, locale: 'ar' | 'en') {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) return '—';
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const digitsOnly = `${whole}${fraction}`.replace(/^0+(?=\d)/, '');
  const decimalPlaces = fraction.length + 2;
  const padded = digitsOnly.padStart(decimalPlaces + 1, '0');
  const majorWhole = padded.slice(0, -decimalPlaces) || '0';
  const majorFraction = padded
    .slice(-decimalPlaces)
    .replace(/0+$/, '')
    .padEnd(2, '0');
  const integer = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en', {
    maximumFractionDigits: 0,
  }).format(BigInt(majorWhole));
  const digits = (input: string) =>
    locale === 'ar'
      ? input.replace(/\d/g, (digit) =>
          String.fromCharCode(0x0660 + Number(digit)),
        )
      : input;
  const decimal =
    new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en')
      .formatToParts(1.1)
      .find((part) => part.type === 'decimal')?.value ?? '.';
  return `${negative ? '−' : ''}${integer}${decimal}${digits(majorFraction)} EGP`;
}

function nextMonth(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year!, number! - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function ReportsView({
  locale,
  month,
  workspaceId,
  workspaces,
  data,
  totalConvertedEgp,
  messages: m,
}: {
  locale: 'ar' | 'en';
  month: string;
  workspaceId: string;
  workspaces: { id: string; name: string }[];
  data: ReportsData;
  totalConvertedEgp: string | null;
  messages: Messages;
}) {
  const router = useRouter();
  const pendingCount =
    data.collections.status === 'ok'
      ? data.collections.pendingEventIds.length
      : 0;
  const packageNames = useMemo(
    () => (item: ReportPackage | null) => packageLabel(item, locale),
    [locale],
  );
  function navigate(next: { month?: string; workspace?: string }) {
    const query = new URLSearchParams({
      month: next.month ?? month,
      workspace: next.workspace ?? workspaceId,
    });
    router.push(`/reports?${query.toString()}`);
  }
  const columns = {
    date: m['reports.column.date'],
    package: m['reports.column.package'],
    client: m['reports.column.client'],
    amount: m['reports.column.amount'],
    currency: m['reports.column.currency'],
    converted: m['reports.column.convertedEgp'],
    commission: m['reports.column.commission'],
    pending: m['reports.column.pendingRates'],
    due: m['reports.column.dueOn'],
    paid: m['reports.column.paid'],
    remaining: m['reports.column.remaining'],
  };
  return (
    <main
      className={styles.main}
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <header className={styles.header}>
        <h1>{m['reports.title']}</h1>
      </header>
      <section className={styles.controls} aria-label={m['reports.title']}>
        <label className={styles.control}>
          <span>{m['reports.month']}</span>
          <input
            type="month"
            value={month}
            onChange={(event) => navigate({ month: event.currentTarget.value })}
          />
        </label>
        <div className={styles.monthButtons}>
          <Button
            variant="secondary"
            onClick={() => navigate({ month: nextMonth(month, -1) })}
          >
            {m['reports.previousMonth']}
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate({ month: nextMonth(month, 1) })}
          >
            {m['reports.nextMonth']}
          </Button>
        </div>
        <label className={styles.control}>
          <span>{m['packages.workspace']}</span>
          <select
            value={workspaceId}
            onChange={(event) =>
              navigate({ workspace: event.currentTarget.value })
            }
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className={styles.section} aria-labelledby="collections-title">
        <div className={styles.sectionHeader}>
          <h2 id="collections-title">{m['reports.section.collections']}</h2>
          <p>{m['reports.collections.help']}</p>
        </div>
        {data.collections.status === 'error' ? (
          <Alert tone="error" title={m['reports.collections.loadError']} />
        ) : data.collections.rows.length === 0 ? (
          <EmptyState title={m['reports.collections.empty']} />
        ) : (
          <div className={styles.cards}>
            {data.collections.rows.map((row) => (
              <article className={styles.card} key={row.id}>
                <dl className={styles.details}>
                  <dt>{columns.date}</dt>
                  <dd>{cairoDate(row.recordedAt, locale)}</dd>
                  <dt>{columns.package}</dt>
                  <dd>{packageNames(row.package)}</dd>
                  <dt>{columns.client}</dt>
                  <dd>{row.clientName ?? '—'}</dd>
                  <dt>{columns.amount}</dt>
                  <dd>{exactAmount(row.amountMinor, row.currency, locale)}</dd>
                  <dt>{columns.currency}</dt>
                  <dd>{row.currency}</dd>
                  <dt>{columns.converted}</dt>
                  <dd>
                    {row.convertedEgpExact === null ? (
                      <span className={styles.pending}>
                        {m['reports.statusPendingRate']}
                      </span>
                    ) : (
                      exactConvertedAmount(row.convertedEgpExact, locale)
                    )}
                  </dd>
                </dl>
              </article>
            ))}
          </div>
        )}
        {data.collections.status === 'ok' && (
          <footer className={styles.total}>
            <strong>{m['reports.totalConvertedEgp']}</strong>
            <span>{totalConvertedEgp ?? m['reports.statusPendingRate']}</span>
            {pendingCount > 0 && (
              <span className={styles.pending}>
                {m['reports.column.pendingRates']}: {pendingCount}
              </span>
            )}
          </footer>
        )}
      </section>

      <section className={styles.section} aria-labelledby="commissions-title">
        <div className={styles.sectionHeader}>
          <h2 id="commissions-title">{m['reports.section.commissions']}</h2>
          <p>{m['reports.commissions.help']}</p>
        </div>
        {data.commissions.status === 'error' ? (
          <Alert tone="error" title={m['reports.commissions.loadError']} />
        ) : data.commissions.rows.length === 0 ? (
          <EmptyState title={m['reports.commissions.empty']} />
        ) : (
          <div className={styles.cards}>
            {data.commissions.rows.map((row, index) => (
              <article
                className={styles.card}
                key={`${row.package?.id ?? 'unknown'}-${index}`}
              >
                <dl className={styles.details}>
                  <dt>{columns.package}</dt>
                  <dd>{packageNames(row.package)}</dd>
                  <dt>{columns.commission}</dt>
                  <dd className={styles.currencyList}>
                    {Object.entries(row.byCurrency).map(
                      ([currency, amount]) => (
                        <span key={currency}>
                          {exactAmount(amount, currency, locale)}
                        </span>
                      ),
                    )}
                  </dd>
                  <dt>{columns.converted}</dt>
                  <dd>
                    {row.convertedEgpExact === null ? (
                      <span className={styles.pending}>
                        {m['reports.statusPendingRate']}
                      </span>
                    ) : (
                      exactConvertedAmount(row.convertedEgpExact, locale)
                    )}
                  </dd>
                  <dt>{columns.pending}</dt>
                  <dd>{row.pendingRateCount}</dd>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="installments-title">
        <div className={styles.sectionHeader}>
          <h2 id="installments-title">{m['reports.section.installments']}</h2>
          <p>{m['reports.installments.help']}</p>
        </div>
        {data.installments.status === 'error' ? (
          <Alert tone="error" title={m['reports.installments.loadError']} />
        ) : data.installments.rows.length === 0 ? (
          <EmptyState title={m['reports.installments.empty']} />
        ) : (
          <div className={styles.cards}>
            {data.installments.rows.map((row) => (
              <article className={styles.card} key={row.id}>
                <dl className={styles.details}>
                  <dt>{columns.client}</dt>
                  <dd>
                    {row.clientName ?? '—'}
                    {row.isInstallmentClient && (
                      <span className={styles.badge}>
                        {m['reports.installmentClient']}
                      </span>
                    )}
                  </dd>
                  <dt>{columns.package}</dt>
                  <dd>{packageNames(row.package)}</dd>
                  <dt>{columns.due}</dt>
                  <dd>{row.dueOn ?? '—'}</dd>
                  <dt>{columns.amount}</dt>
                  <dd>{exactAmount(row.amountMinor, row.currency, locale)}</dd>
                  <dt>{columns.paid}</dt>
                  <dd>{exactAmount(row.paidMinor, row.currency, locale)}</dd>
                  <dt>{columns.remaining}</dt>
                  <dd>
                    {exactAmount(row.remainingMinor, row.currency, locale)}
                  </dd>
                  <dt>{columns.currency}</dt>
                  <dd>{row.currency}</dd>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

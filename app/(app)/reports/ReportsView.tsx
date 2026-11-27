'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { EmptyState } from '../../../components/ui/States';
import { Button } from '../../../components/ui/Button';
import { formatMinorUnits } from '../../../lib/packages/money';
import type { Messages } from '../../../lib/i18n';
import { ExportSection } from './ExportSection';
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

export type DrilldownSourceRow = {
  id: string;
  recordedAt: string;
  package: ReportPackage | null;
  clientName: string | null;
  kind:
    | 'collection'
    | 'correction_reversal'
    | 'refund'
    | 'client_count'
    | 'subscription_count'
    | 'commission'
    | 'installment';
  status: string;
  amountMinor?: string | null;
  currency?: string | null;
  convertedEgpExact: string | null;
  commissionMinor?: string | null;
  dueOn?: string | null;
  paidMinor?: string | null;
  remainingMinor?: string | null;
  pendingRates?: number;
};

export type PlatformData = {
  status: 'ok' | 'empty' | 'error';
  period: string;
  breakdown: 'month' | 'package';
  totals: {
    revenueConvertedEgpMinor: string;
    subscriptionCount: number;
    clientCount: number;
  };
  workspaceAggregates: {
    workspaceId: string;
    workspaceName: string;
    revenueConvertedEgpMinor: string;
    subscriptionCount: number;
    clientCount: number;
  }[];
  breakdowns: {
    key: string;
    label: string;
    package?: ReportPackage | null;
    revenueConvertedEgpMinor: string;
    subscriptionCount: number;
    clientCount: number;
  }[];
};

export type DrilldownData = {
  status: 'ok' | 'empty' | 'error';
  workspaceId: string;
  workspaceName: string;
  rows: DrilldownSourceRow[];
  totals: {
    revenueConvertedEgpMinor: string;
    subscriptionCount: number;
    clientCount: number;
  };
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

export function kindLabel(kind: string, m: Messages): string {
  switch (kind) {
    case 'collection':
      return m['reports.section.collections'];
    case 'correction_reversal':
      return m['workforce.payroll.input.category.correction'];
    case 'refund':
      return m['staff.clientDirectory.subscriptionStatus.refunded'];
    case 'client_count':
      return m['reports.metric.clients'];
    case 'subscription_count':
      return m['reports.metric.subscriptions'];
    default:
      return '—';
  }
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
  const isNegative = value.startsWith('-');
  const absValue = isNegative ? value.slice(1) : value;
  const formatted = formatMinorUnits(absValue, currency, locale);
  if (isNegative) {
    return locale === 'ar'
      ? `\u2068−${formatted.replace(/^[\u2068\u2069]/g, '')}\u2069`
      : `−${formatted}`;
  }
  return formatted;
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
  role = 'platform_owner',
  messages: m,
  breakdown = 'month',
  platformData,
  drilldownData,
}: {
  locale: 'ar' | 'en';
  month: string;
  workspaceId: string;
  workspaces: { id: string; name: string }[];
  data: ReportsData;
  totalConvertedEgp: string | null;
  role?: string | null;
  messages: Messages;
  breakdown?: 'month' | 'package';
  platformData?: PlatformData | null;
  drilldownData?: DrilldownData | null;
}) {
  const router = useRouter();
  const isPlatformOwner = role === 'platform_owner';
  const pendingCount =
    data.collections.status === 'ok'
      ? data.collections.pendingEventIds.length
      : 0;
  const packageNames = useMemo(
    () => (item: ReportPackage | null) => packageLabel(item, locale),
    [locale],
  );

  function navigate(next: {
    month?: string;
    workspace?: string;
    breakdown?: string;
    drilldown?: string;
  }) {
    const query = new URLSearchParams();
    query.set('month', next.month !== undefined ? next.month : month);
    const ws = next.workspace !== undefined ? next.workspace : workspaceId;
    if (ws && ws !== 'all') query.set('workspace', ws);
    const bd =
      next.breakdown !== undefined ? next.breakdown : (breakdown ?? 'month');
    if (bd && bd !== 'month') query.set('breakdown', bd);
    if (next.drilldown !== undefined) {
      if (next.drilldown) query.set('drilldown', next.drilldown);
    } else if (drilldownData?.workspaceId) {
      query.set('drilldown', drilldownData.workspaceId);
    }
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
    kind: m['reports.column.kind'],
    status: m['reports.column.status'],
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
            {isPlatformOwner && <option value="all">{m['catalog.all']}</option>}
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
        {isPlatformOwner && !drilldownData && (
          <label className={styles.control}>
            <span>{m['reports.breakdown.label']}</span>
            <select
              value={breakdown}
              onChange={(event) =>
                navigate({ breakdown: event.currentTarget.value })
              }
            >
              <option value="month">{m['reports.breakdown.byMonth']}</option>
              <option value="package">
                {m['reports.breakdown.byPackage']}
              </option>
            </select>
          </label>
        )}
      </section>

      {/* Screen 2: Workspace Drill-Down Source Rows (PO only) */}
      {isPlatformOwner && drilldownData && (
        <section className={styles.section} aria-labelledby="drilldown-title">
          <div className={styles.drilldownHeader}>
            <div className={styles.drilldownTitleRow}>
              <h2 id="drilldown-title">
                {m['reports.drilldown.workspaceHeading']} ·{' '}
                {drilldownData.workspaceName}
              </h2>
              <Button
                variant="secondary"
                onClick={() => navigate({ drilldown: '' })}
              >
                {m['button.secondary']}
              </Button>
            </div>
          </div>
          {drilldownData.status === 'error' ? (
            <div>
              <Alert tone="error" title={m['states.error.title']} />
              <p style={{ margin: 'var(--space-2) 0' }}>
                {m['states.error.description']}
              </p>
              <Button
                variant="secondary"
                onClick={() =>
                  navigate({ drilldown: drilldownData.workspaceId })
                }
              >
                {m['states.retry']}
              </Button>
            </div>
          ) : drilldownData.rows.length === 0 ? (
            <EmptyState title={m['reports.drilldown.sourceRows.empty']} />
          ) : (
            <>
              <div className={styles.cards}>
                {drilldownData.rows.map((row) => (
                  <article className={styles.card} key={row.id}>
                    <dl className={styles.details}>
                      <dt>{columns.date}</dt>
                      <dd>{cairoDate(row.recordedAt, locale)}</dd>
                      <dt>{columns.package}</dt>
                      <dd>{packageNames(row.package)}</dd>
                      <dt>{columns.client}</dt>
                      <dd>{row.clientName ?? '—'}</dd>
                      <dt>{columns.kind}</dt>
                      <dd>{kindLabel(row.kind, m)}</dd>
                      <dt>{columns.status}</dt>
                      <dd>{row.status}</dd>
                      {row.amountMinor !== null &&
                        row.amountMinor !== undefined &&
                        row.currency && (
                          <>
                            <dt>{columns.amount}</dt>
                            <dd>
                              {exactAmount(
                                row.amountMinor,
                                row.currency,
                                locale,
                              )}
                            </dd>
                            <dt>{columns.currency}</dt>
                            <dd>{row.currency}</dd>
                            <dt>{columns.converted}</dt>
                            <dd>
                              {row.convertedEgpExact === null ? (
                                <span className={styles.pending}>
                                  {m['reports.statusPendingRate']}
                                </span>
                              ) : (
                                exactConvertedAmount(
                                  row.convertedEgpExact,
                                  locale,
                                )
                              )}
                            </dd>
                          </>
                        )}
                      {row.commissionMinor && row.currency && (
                        <>
                          <dt>{columns.commission}</dt>
                          <dd>
                            {exactAmount(
                              row.commissionMinor,
                              row.currency,
                              locale,
                            )}
                          </dd>
                        </>
                      )}
                      {row.dueOn && (
                        <>
                          <dt>{columns.due}</dt>
                          <dd>{row.dueOn}</dd>
                        </>
                      )}
                      {row.paidMinor && row.currency && (
                        <>
                          <dt>{columns.paid}</dt>
                          <dd>
                            {exactAmount(row.paidMinor, row.currency, locale)}
                          </dd>
                        </>
                      )}
                      {row.remainingMinor && row.currency && (
                        <>
                          <dt>{columns.remaining}</dt>
                          <dd>
                            {exactAmount(
                              row.remainingMinor,
                              row.currency,
                              locale,
                            )}
                          </dd>
                        </>
                      )}
                    </dl>
                  </article>
                ))}
              </div>
              <footer className={styles.total}>
                <strong>{m['reports.totalConvertedEgp']}</strong>
                <span>
                  {exactConvertedAmount(
                    drilldownData.totals.revenueConvertedEgpMinor,
                    locale,
                  )}
                </span>
              </footer>
            </>
          )}
        </section>
      )}

      {/* Screen 1: Platform Aggregate Reports & Breakdowns (PO only, overview) */}
      {isPlatformOwner && !drilldownData && platformData && (
        <section className={styles.section} aria-labelledby="platform-title">
          <div className={styles.sectionHeader}>
            <div id="platform-title" className={styles.sectionHeading}>
              {m['reports.platform.title']}
            </div>
          </div>
          {platformData.status === 'error' ? (
            <div>
              <Alert tone="error" title={m['reports.drilldown.error']} />
              <Button
                variant="secondary"
                onClick={() => navigate({})}
                style={{ marginBlockStart: 'var(--space-3)' }}
              >
                {m['states.retry']}
              </Button>
            </div>
          ) : platformData.workspaceAggregates.length === 0 ? (
            <EmptyState title={m['reports.drilldown.empty']} />
          ) : (
            <>
              {/* Totals Metric Grid */}
              <div className={styles.metricsGrid}>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>
                    {m['reports.metric.revenue']}
                  </span>
                  <span className={styles.metricValue}>
                    {exactConvertedAmount(
                      platformData.totals.revenueConvertedEgpMinor,
                      locale,
                    )}
                  </span>
                  <span className={styles.metricSub}>
                    {m['reports.totalConvertedEgp']}
                  </span>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>
                    {m['reports.metric.subscriptions']}
                  </span>
                  <span className={styles.metricValue}>
                    {platformData.totals.subscriptionCount}
                  </span>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>
                    {m['reports.metric.clients']}
                  </span>
                  <span className={styles.metricValue}>
                    {platformData.totals.clientCount}
                  </span>
                </div>
              </div>

              {/* Breakdown Section */}
              <div className={styles.breakdownSection}>
                <div className={styles.subheading}>
                  {m['reports.breakdown.label']}:{' '}
                  {breakdown === 'package'
                    ? m['reports.breakdown.byPackage']
                    : m['reports.breakdown.byMonth']}
                </div>
                <div className={styles.cards}>
                  {platformData.breakdowns.map((item) => (
                    <article className={styles.card} key={item.key}>
                      <dl className={styles.details}>
                        <dt>
                          {breakdown === 'package'
                            ? m['reports.column.package']
                            : m['reports.month']}
                        </dt>
                        <dd>{item.label}</dd>
                        <dt>{m['reports.metric.revenue']}</dt>
                        <dd>
                          {exactConvertedAmount(
                            item.revenueConvertedEgpMinor,
                            locale,
                          )}
                        </dd>
                        <dt>{m['reports.metric.subscriptions']}</dt>
                        <dd>{item.subscriptionCount}</dd>
                        <dt>{m['reports.metric.clients']}</dt>
                        <dd>{item.clientCount}</dd>
                      </dl>
                    </article>
                  ))}
                </div>
              </div>

              {/* Workspace Aggregates List */}
              <div className={styles.workspacesSection}>
                <div className={styles.subheading}>
                  {m['packages.workspace']}
                </div>
                <div className={styles.cards}>
                  {platformData.workspaceAggregates.map((ws) => (
                    <article className={styles.card} key={ws.workspaceId}>
                      <dl className={styles.details}>
                        <dt>{m['packages.workspace']}</dt>
                        <dd>
                          <strong>{ws.workspaceName}</strong>
                        </dd>
                        <dt>{m['reports.metric.revenue']}</dt>
                        <dd>
                          {exactConvertedAmount(
                            ws.revenueConvertedEgpMinor,
                            locale,
                          )}
                        </dd>
                        <dt>{m['reports.metric.subscriptions']}</dt>
                        <dd>{ws.subscriptionCount}</dd>
                        <dt>{m['reports.metric.clients']}</dt>
                        <dd>{ws.clientCount}</dd>
                      </dl>
                      <div className={styles.cardAction}>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            navigate({ drilldown: ws.workspaceId })
                          }
                        >
                          {m['reports.drilldown.action']}
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* Workspace collections, commissions, installments (existing sections) */}
      {!drilldownData && (
        <>
          <section
            className={styles.section}
            aria-labelledby="collections-title"
          >
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
                      <dd>
                        {exactAmount(row.amountMinor, row.currency, locale)}
                      </dd>
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
                <span>
                  {totalConvertedEgp ?? m['reports.statusPendingRate']}
                </span>
                {pendingCount > 0 && (
                  <span className={styles.pending}>
                    {m['reports.column.pendingRates']}: {pendingCount}
                  </span>
                )}
              </footer>
            )}
          </section>

          <section
            className={styles.section}
            aria-labelledby="commissions-title"
          >
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

          <section
            className={styles.section}
            aria-labelledby="installments-title"
          >
            <div className={styles.sectionHeader}>
              <h2 id="installments-title">
                {m['reports.section.installments']}
              </h2>
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
                      <dd>
                        {exactAmount(row.amountMinor, row.currency, locale)}
                      </dd>
                      <dt>{columns.paid}</dt>
                      <dd>
                        {exactAmount(row.paidMinor, row.currency, locale)}
                      </dd>
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
        </>
      )}

      {role === 'platform_owner' && (
        <ExportSection
          canExport
          locale={locale}
          workspaces={workspaces}
          messages={m}
        />
      )}
    </main>
  );
}

'use client';
import type { Locale } from '../../lib/design/preferences';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { getMessages } from '../../lib/i18n';
import type { RegistrationData } from '../../lib/registration-links/read';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/States';
import { RegistrationLinkDialog } from './RegistrationLinkDialog';
import styles from './registration-links.module.css';

const GlassR4Showcase = dynamic(
  () =>
    import('../ui/glass/GlassR4Showcase').then(
      (module) => module.GlassR4Showcase,
    ),
  { ssr: false },
);
export function RegistrationLinksManager({
  workspaceId,
  workspaces,
  data,
  canSchedule,
  locale,
  showGlassShowcase = false,
}: {
  workspaceId: string;
  workspaces: { id: string; name: string }[];
  data: RegistrationData;
  canSchedule: boolean;
  locale: Locale;
  showGlassShowcase?: boolean;
}) {
  const m = getMessages(locale),
    router = useRouter();
  const [selected, setSelected] = useState(data.offers[0]?.id ?? ''),
    [dialog, setDialog] = useState(false);
  const version = data.offers.find((v) => v.id === selected);
  return (
    <main className={styles.main}>
      <header>
        <h1>{m['registration.title']}</h1>
        <p>{m['registration.intro']}</p>
      </header>
      <label className={styles.selector}>
        {m['registration.workspace']}
        <select
          value={workspaceId}
          onChange={(e) => {
            setDialog(false);
            router.push(
              `/registration-links?workspace=${encodeURIComponent(e.target.value)}`,
            );
          }}
        >
          {workspaces.map((w) => (
            <option value={w.id} key={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <section className={styles.panel} aria-labelledby="issue-heading">
        <h2 id="issue-heading">{m['registration.new']}</h2>
        {data.offers.length === 0 ? (
          <EmptyState title={m['registration.noOffer']} />
        ) : (
          <>
            <label className={styles.selector}>
              {m['registration.package']}
              <select
                value={selected}
                onChange={(e) => {
                  setDialog(false);
                  setSelected(e.target.value);
                }}
              >
                {data.offers.map((v) => (
                  <option value={v.id} key={v.id}>
                    {locale === 'ar' ? v.name_ar : v.name_en} ·{' '}
                    {v.duration_days} {m['registration.days']}
                  </option>
                ))}
              </select>
            </label>
            {version && (
              <>
                <p>
                  {m['registration.price']}:{' '}
                  <bdi>
                    {version.price_minor} {version.currency}
                  </bdi>
                </p>
                <Button onClick={() => setDialog(true)}>
                  {m['registration.issue']}
                </Button>
              </>
            )}
          </>
        )}
      </section>
      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading">{m['registration.recent']}</h2>
        {data.links.length === 0 ? (
          <EmptyState title={m['registration.empty']} />
        ) : (
          <ul className={styles.list}>
            {data.links.map((l) => (
              <li className={styles.panel} key={l.id}>
                <strong>{m[`registration.${l.status}`]}</strong>
                <p>
                  <time dateTime={l.created_at}>
                    {new Date(l.created_at).toLocaleString(locale, {
                      timeZone: 'Africa/Cairo',
                    })}
                  </time>
                </p>
                <p>
                  <bdi>
                    {l.price_minor} {l.currency}
                  </bdi>{' '}
                  · {l.duration_days} {m['registration.days']}
                </p>
                {l.opened_at && (
                  <p>
                    {m['registration.firstOpen']}:{' '}
                    <time dateTime={l.opened_at}>
                      {new Date(l.opened_at).toLocaleString(locale, {
                        timeZone: 'Africa/Cairo',
                      })}
                    </time>
                  </p>
                )}
                {l.commission_rate_bp !== undefined && (
                  <p>
                    {m['registration.rate']}: {l.commission_rate_bp}
                  </p>
                )}
                {data.installments.some((r) => r.link_id === l.id) && (
                  <ol>
                    {data.installments
                      .filter((r) => r.link_id === l.id)
                      .map((r) => (
                        <li key={r.seq}>
                          <bdi>
                            {r.amount_minor} {l.currency}
                          </bdi>{' '}
                          · {m['registration.offset']}: {r.due_offset_days}
                        </li>
                      ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {dialog && version && (
        <RegistrationLinkDialog
          key={`${workspaceId}:${version.id}`}
          workspaceId={workspaceId}
          versionId={version.id}
          priceMinor={version.price_minor}
          locale={locale}
          canSchedule={canSchedule}
          onClose={() => setDialog(false)}
        />
      )}
      {showGlassShowcase && <GlassR4Showcase locale={locale} />}
    </main>
  );
}

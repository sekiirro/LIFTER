import type { Locale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import type { WorkoutVolumeReport } from '../../../lib/plans/workout/volume';
import { Bidi } from '../../ui/Bidi';
import { Card } from '../../ui/Card';
import styles from './WorkoutVolumeSummary.module.css';

export type WorkoutVolumeSummaryProps = {
  report: WorkoutVolumeReport;
  locale: Locale;
  muscleLabels: Readonly<Record<string, string>>;
};

function formatCredit(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(value);
}

function muscleLabel(
  code: string,
  labels: Readonly<Record<string, string>>,
): string {
  const label = labels[code]?.trim();
  return label ? label : code;
}

function CreditCell({ credit, locale }: { credit: number; locale: Locale }) {
  return (
    <td className={styles.numeric} data-credit={String(credit)}>
      <Bidi dir="ltr">{formatCredit(credit, locale)}</Bidi>
    </td>
  );
}

export function WorkoutVolumeSummary({
  report,
  locale,
  muscleLabels,
}: WorkoutVolumeSummaryProps) {
  const m = getMessages(locale);
  const weekRows = Object.entries(report.weekTotals);
  const hasVolume = weekRows.length > 0;

  return (
    <Card as="section" className={styles.summary} data-testid="volume-summary">
      <header className={styles.header}>
        <h2 className={styles.title}>{m['volume.title']}</h2>
        <p className={styles.intro}>{m['volume.intro']}</p>
      </header>

      {!hasVolume ? (
        <p className={styles.empty}>{m['volume.empty']}</p>
      ) : (
        <>
          <div className={`${styles.block} ${styles.week}`}>
            <h3 className={styles.heading}>{m['volume.weekTotals']}</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table} data-testid="volume-week">
                <caption className={styles.caption}>
                  {m['volume.weekCaption']}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{m['volume.muscleGroup']}</th>
                    <th scope="col" className={styles.numeric}>
                      {m['volume.credit']}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {weekRows.map(([muscle, credit]) => (
                    <tr key={muscle} data-testid={`volume-week-${muscle}`}>
                      <th scope="row">{muscleLabel(muscle, muscleLabels)}</th>
                      <CreditCell credit={credit} locale={locale} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {report.sessions.length > 0 ? (
            <div className={styles.block}>
              <h3 className={styles.heading}>{m['volume.sessions']}</h3>
              <div className={styles.sessionGrid}>
                {report.sessions.map((session) => {
                  const sessionRows = Object.entries(session.totals);
                  const title =
                    session.title?.trim() || m['volume.untitledSession'];
                  return (
                    <div key={session.dayId} className={styles.session}>
                      <h4 className={styles.sessionTitle}>{title}</h4>
                      {sessionRows.length === 0 ? (
                        <p className={styles.empty}>
                          {m['volume.noWorkingSets']}
                        </p>
                      ) : (
                        <div className={styles.tableWrap}>
                          <table
                            className={styles.table}
                            data-testid={`volume-session-${session.dayId}`}
                          >
                            <caption className={styles.srOnly}>
                              {title}. {m['volume.sessionCaption']}
                            </caption>
                            <thead>
                              <tr>
                                <th scope="col">{m['volume.muscleGroup']}</th>
                                <th scope="col" className={styles.numeric}>
                                  {m['volume.credit']}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {sessionRows.map(([muscle]) => {
                                const credit = session.totals[muscle];
                                return (
                                  <tr
                                    key={muscle}
                                    data-testid={`volume-session-${session.dayId}-${muscle}`}
                                  >
                                    <th scope="row">
                                      {muscleLabel(muscle, muscleLabels)}
                                    </th>
                                    <CreditCell
                                      credit={credit ?? 0}
                                      locale={locale}
                                    />
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

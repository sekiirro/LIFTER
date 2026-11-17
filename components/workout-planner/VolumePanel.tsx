import { useId, type ReactNode } from 'react';
import { dirFor, type Locale } from '../../lib/design/preferences';
import { getMessages, type MessageKey, type Messages } from '../../lib/i18n';
import { formatUiNumber } from '../../lib/i18n/format-digits';
import {
  computeVolume,
  type MuscleMembership,
  type MuscleTotals,
  type VolumeDay,
} from '../../lib/workout-planner/volume';
import { Bidi } from '../ui/Bidi';
import { EmptyState } from '../ui/States';
import styles from './VolumePanel.module.css';

export type VolumePanelProps = {
  locale: Locale;
  days: VolumeDay[];
  muscles: Record<string, MuscleMembership>;
  title?: string;
};

type ColumnSpec = {
  id: string;
  header: ReactNode;
  totals: MuscleTotals;
};

function resolveMuscleLabel(muscle: string, m: Messages): ReactNode {
  const exactKey = `catalog.taxonomy.muscle.${muscle}` as MessageKey;
  if (exactKey in m) return m[exactKey];
  const normalized = muscle.trim().toLowerCase().replace(/\s+/g, '_');
  const normKey = `catalog.taxonomy.muscle.${normalized}` as MessageKey;
  if (normKey in m) return m[normKey];
  return <Bidi dir="ltr">{muscle}</Bidi>;
}

function renderWeekHeading(
  template: string,
  week: number,
  locale: Locale,
): ReactNode {
  const parts = template.split('{n}');
  if (parts.length !== 2) {
    return (
      <>
        {template} <Bidi dir="ltr">{formatUiNumber(week, locale)}</Bidi>
      </>
    );
  }
  return (
    <>
      {parts[0]}
      <Bidi dir="ltr">{formatUiNumber(week, locale)}</Bidi>
      {parts[1]}
    </>
  );
}

function collectMuscles(columns: ColumnSpec[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const col of columns) {
    for (const [muscle, value] of Object.entries(col.totals)) {
      if (value > 0 && !seen.has(muscle)) {
        seen.add(muscle);
        list.push(muscle);
      }
    }
  }
  return list;
}

function VolumeTable({
  caption,
  headingId,
  muscleHeader,
  totalHeader,
  columns,
  musclesList,
  locale,
  m,
}: {
  caption: string;
  headingId: string;
  muscleHeader: string;
  totalHeader: string;
  columns: ColumnSpec[];
  musclesList: string[];
  locale: Locale;
  m: Messages;
}) {
  return (
    <div className={styles.section}>
      <h3 id={headingId} className={styles.sectionTitle}>
        {caption}
      </h3>
      <div
        className={styles.tableWrap}
        role="region"
        aria-labelledby={headingId}
        tabIndex={0}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{muscleHeader}</th>
              {columns.map((col) => (
                <th key={col.id} scope="col">
                  {col.header}
                </th>
              ))}
              <th scope="col" className={styles.totalCol}>
                {totalHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {musclesList.map((muscle) => {
              const rowTotal = columns.reduce(
                (sum, col) => sum + (col.totals[muscle] ?? 0),
                0,
              );
              return (
                <tr key={muscle}>
                  <th scope="row">{resolveMuscleLabel(muscle, m)}</th>
                  {columns.map((col) => {
                    const value = col.totals[muscle] ?? 0;
                    return (
                      <td
                        key={col.id}
                        className={value === 0 ? styles.zeroCell : undefined}
                      >
                        <Bidi dir="ltr">{formatUiNumber(value, locale)}</Bidi>
                      </td>
                    );
                  })}
                  <td className={styles.totalCol}>
                    <Bidi dir="ltr">{formatUiNumber(rowTotal, locale)}</Bidi>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Displays per-week and per-session working-set muscle volume computed by
 * `computeVolume` (FR-016, SC-007).
 */
export function VolumePanel({
  locale,
  days,
  muscles,
  title,
}: VolumePanelProps) {
  const m = getMessages(locale);
  const dir = dirFor(locale);
  const headingId = useId();
  const weekHeadingId = useId();
  const sessionHeadingId = useId();

  const { perSession, perWeek } = computeVolume(days, muscles);
  const dayKindByIndex = new Map(days.map((day) => [day.dayIndex, day.kind]));

  const weekColumns: ColumnSpec[] = perWeek.map((week) => ({
    id: `week-${week.week}`,
    header: renderWeekHeading(m['workout.volume.week'], week.week, locale),
    totals: week.totals,
  }));

  const sessionColumns: ColumnSpec[] = perSession.map((session) => {
    const isRest = dayKindByIndex.get(session.dayIndex) === 'rest';
    return {
      id: `day-${session.dayIndex}`,
      header: (
        <>
          {m['workout.export.day']}{' '}
          <Bidi dir="ltr">{formatUiNumber(session.dayIndex, locale)}</Bidi>
          {isRest && (
            <span className={styles.daySub}>{m['workout.export.restDay']}</span>
          )}
        </>
      ),
      totals: session.totals,
    };
  });

  const activeMuscles = collectMuscles(weekColumns);
  const hasWorkingVolume = activeMuscles.length > 0;

  return (
    <section
      dir={dir}
      lang={locale}
      aria-labelledby={headingId}
      className={styles.panel}
      data-testid="workout-volume-panel"
    >
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h2 id={headingId} className={styles.title}>
            {title ?? m['workout.volume.title']}
          </h2>
          <p className={styles.subtitle}>
            {m['workout.volume.workingSets']} ·{' '}
            {m['workout.volume.warmupNotCounted']}
          </p>
        </div>
        <div className={styles.legend}>
          <span className={`${styles.badge} ${styles.badgePrimary}`}>
            {m['workout.volume.primary']}
          </span>
          <span className={styles.badge}>{m['workout.volume.secondary']}</span>
        </div>
      </header>

      {!hasWorkingVolume ? (
        <EmptyState title={m['workout.volume.empty']} />
      ) : (
        <>
          <VolumeTable
            caption={m['workout.volume.workingSets']}
            headingId={weekHeadingId}
            muscleHeader={m['workout.volume.muscle']}
            totalHeader={m['workout.volume.total']}
            columns={weekColumns}
            musclesList={activeMuscles}
            locale={locale}
            m={m}
          />
          <VolumeTable
            caption={m['workout.volume.session']}
            headingId={sessionHeadingId}
            muscleHeader={m['workout.volume.muscle']}
            totalHeader={m['workout.volume.total']}
            columns={sessionColumns}
            musclesList={activeMuscles}
            locale={locale}
            m={m}
          />
        </>
      )}
    </section>
  );
}

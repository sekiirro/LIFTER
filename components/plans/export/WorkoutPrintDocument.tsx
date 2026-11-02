import type { WorkoutDocument } from '../../../lib/plans/workout/schema';
import { parseWorkoutDocumentForRender } from '../../../lib/plans/workout/schema-registry';
import { Bidi } from '../../ui/Bidi';
import { getMessages } from '../../../lib/i18n';
import {
  resolvePrintLayout,
  type PrintLocale,
} from '../../../lib/plans/export/print-layout';
import type { PublishedWorkoutVersionApiResponse } from '../../../lib/plans/export/excel';
import { WorkoutPrintAction } from './WorkoutPrintAction';
import styles from './WorkoutPrintDocument.module.css';

type Row = {
  id: string;
  setNumber: string;
  exercise: string;
  type: string;
  reps: string;
  load: string;
  rest: string;
  rir: string;
  alternatives: string;
  notes: string;
};

function referenceLabel(reference: {
  source: string;
  id: string;
  version: number;
}) {
  return `${reference.source}:${reference.id} v${reference.version}`;
}

function rowsForDay(document: WorkoutDocument, locale: PrintLocale) {
  const rows: Row[][] = [];
  document.days.forEach((day) => {
    if (day.kind === 'rest') {
      rows.push([
        {
          id: day.id,
          setNumber: '',
          exercise: getMessages(locale)['workoutPrint.restDay'],
          type: '',
          reps: '',
          load: '',
          rest: '',
          rir: '',
          alternatives: '',
          notes: day.notes ?? '',
        },
      ]);
      return;
    }
    const dayRows: Row[] = [];
    for (const item of day.items ?? []) {
      const exercise = referenceLabel(item.exercise);
      const alternatives = (item.alternatives ?? [])
        .map(referenceLabel)
        .join('; ');
      if (item.sets.length === 0) {
        dayRows.push({
          id: item.id,
          setNumber: '',
          exercise,
          type: '',
          reps: '',
          load: '',
          rest: '',
          rir: '',
          alternatives,
          notes: [day.notes, item.notes].filter(Boolean).join('\n'),
        });
      }
      for (const [setIndex, set] of item.sets.entries()) {
        const reps =
          'value' in set.reps
            ? String(set.reps.value)
            : `${set.reps.min}–${set.reps.max}`;
        const load =
          set.load.mode === 'bodyweight'
            ? getMessages(locale)['workoutPrint.bodyweight']
            : `${getMessages(locale)[set.load.mode === 'assisted' ? 'workoutPrint.assisted' : 'workoutPrint.addedWeight']} ${set.load.value} ${set.load.unit}`;
        dayRows.push({
          id: set.id,
          setNumber: String(setIndex + 1),
          exercise,
          type:
            set.type === 'warmup'
              ? getMessages(locale)['workoutPrint.warmup']
              : getMessages(locale)['workoutPrint.working'],
          reps,
          load,
          rest: set.restSec === undefined ? '' : String(set.restSec),
          rir: set.rir === undefined ? '' : String(set.rir),
          alternatives,
          notes: [day.notes, item.notes, set.notes]
            .filter((note): note is string => Boolean(note))
            .join('\n'),
        });
      }
    }
    if (dayRows.length === 0) {
      dayRows.push({
        id: day.id,
        setNumber: '',
        exercise: '',
        type: '',
        reps: '',
        load: '',
        rest: '',
        rir: '',
        alternatives: '',
        notes: day.notes ?? '',
      });
    }
    rows.push(dayRows);
  });
  return rows;
}

function dayHeading(
  document: WorkoutDocument,
  index: number,
  locale: PrintLocale,
) {
  const day = document.days[index]!;
  return day.title ?? `${getMessages(locale)['workoutPrint.day']} ${index + 1}`;
}

export function WorkoutPrintDocument({
  version,
  locale,
}: {
  version: PublishedWorkoutVersionApiResponse;
  locale: PrintLocale;
}) {
  const layout = resolvePrintLayout(locale);
  const m = getMessages(locale);
  const document = parseWorkoutDocumentForRender(
    version.schemaVersion,
    version.document,
  );
  const dayRows = rowsForDay(document, locale);
  const columns = [
    ['type', m['workoutPrint.setType']],
    ['reps', m['workoutPrint.reps']],
    ['load', m['workoutPrint.load']],
    ['rest', m['workoutPrint.rest']],
    ['rir', m['workoutPrint.rir']],
    ['alternatives', m['workoutPrint.alternatives']],
    ['notes', m['workoutPrint.notes']],
  ] as const;

  return (
    <main
      lang={layout.lang}
      dir={layout.dir}
      className={`${layout.documentClass} ${styles.document}`}
      data-testid="workout-print-document"
    >
      <header className={styles.header}>
        <div>
          <h1>{m['workoutPrint.title']}</h1>
          <p className={styles.version}>
            {m['workoutPrint.plan']} <Bidi>{version.planId}</Bidi>
            {' · '}
            {m['workoutPrint.version']} <Bidi>{version.version}</Bidi>
          </p>
        </div>
        <WorkoutPrintAction label={m['workoutPrint.print']} />
      </header>
      {document.notes ? (
        <section
          className={styles.planNotes}
          aria-labelledby="plan-notes-title"
        >
          <h2 id="plan-notes-title">{m['workoutPrint.planNotes']}</h2>
          <p className={styles.noteText}>
            <Bidi>{document.notes}</Bidi>
          </p>
        </section>
      ) : null}
      {document.days.map((day, dayIndex) => (
        <section
          key={day.id}
          className={styles.day}
          data-day-id={day.id}
          data-testid="workout-print-day"
          aria-labelledby={`workout-day-${day.id}`}
        >
          <h2 id={`workout-day-${day.id}`}>
            <Bidi>{dayHeading(document, dayIndex, locale)}</Bidi>
          </h2>
          {day.kind === 'rest' ? (
            <p className={styles.restDay}>
              {m['workoutPrint.restDay']}
              {day.notes ? (
                <span className={styles.noteText}>
                  <Bidi>{day.notes}</Bidi>
                </span>
              ) : null}
            </p>
          ) : (
            <div className={styles.rows}>
              {dayRows[dayIndex]?.map((row) => (
                <article className={styles.row} key={row.id}>
                  <h3 className={styles.exercise}>
                    <Bidi>{row.exercise || m['workoutPrint.exercise']}</Bidi>
                  </h3>
                  <dl className={styles.details}>
                    {columns.map(([key, label]) => {
                      const value = row[key as keyof Row];
                      return value ? (
                        <div key={key} className={styles.detail}>
                          <dt>{label}</dt>
                          <dd className={styles.noteText}>
                            <Bidi>{value}</Bidi>
                          </dd>
                        </div>
                      ) : null;
                    })}
                    {row.setNumber ? (
                      <div className={styles.detail}>
                        <dt>{m['workoutPrint.set']}</dt>
                        <dd>
                          <Bidi>{row.setNumber}</Bidi>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>
      ))}
    </main>
  );
}

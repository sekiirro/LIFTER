// F17 printable workout export renderer (T037 part 1; FR-017, FR-018, SC-008).
//
// Renders the render-neutral `WorkoutExportPayload` with UI-language labels
// from PO-approved `workout.export.*` and `print.*` keys, preserves authored
// text verbatim, keeps exercise names in English, and sets `dir="rtl"` for AR
// and `dir="ltr"` for EN.

import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import type {
  WorkoutExportDay,
  WorkoutExportItem,
  WorkoutExportPayload,
  WorkoutExportSet,
} from '../../lib/workout-planner/export-payload';
import { Bidi } from '../ui/Bidi';
import styles from './WorkoutPrintView.module.css';

export type WorkoutPrintViewProps = {
  payload: WorkoutExportPayload;
  locale: Locale;
};

type Messages = ReturnType<typeof getMessages>;

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function formatReps(item: WorkoutExportItem): string {
  if (!item.reps) return '';
  return 'value' in item.reps
    ? String(item.reps.value)
    : `${item.reps.min}-${item.reps.max}`;
}

function formatSetType(set: WorkoutExportSet, m: Messages): string {
  return set.type === 'warmup'
    ? m['workout.export.warmUp']
    : m['workout.export.working'];
}

function formatLoad(set: WorkoutExportSet, m: Messages): string {
  if (set.load.mode === 'bodyweight') {
    return m['workout.export.bodyweight'];
  }
  const mode =
    set.load.mode === 'added_weight'
      ? m['workout.export.addedWeight']
      : m['workout.export.assisted'];
  return `${mode} ${set.load.value} ${set.load.unit}`;
}

function renderVideoUrl(url: string, key: string) {
  if (!isSafeHttpUrl(url)) {
    return (
      <li key={key}>
        <Bidi dir="ltr">{url}</Bidi>
      </li>
    );
  }
  return (
    <li key={key}>
      <a
        className={styles.videoLink}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Bidi dir="ltr">{url}</Bidi>
      </a>
    </li>
  );
}

function renderItemRows(
  item: WorkoutExportItem,
  itemIndex: number,
  m: Messages,
) {
  const reps = formatReps(item);
  const restSec = item.restSec === undefined ? '' : String(item.restSec);
  const rir = item.rir === undefined ? '' : String(item.rir);
  const videoUrls = [
    ...(item.videoUrl === undefined ? [] : [item.videoUrl]),
    ...item.alternatives.flatMap((alt) =>
      alt.videoUrl === undefined ? [] : [alt.videoUrl],
    ),
  ];

  const setsToRender: (WorkoutExportSet | null)[] =
    item.sets.length === 0 ? [null] : item.sets;

  return setsToRender.map((set, setIndex) => (
    <tr key={`${itemIndex}-${setIndex}`}>
      <th scope="row">
        <Bidi dir="ltr">{item.name}</Bidi>
      </th>
      <td>
        {item.description !== undefined ? <Bidi>{item.description}</Bidi> : ''}
      </td>
      <td>{set === null ? '' : <Bidi dir="ltr">{setIndex + 1}</Bidi>}</td>
      <td>{set === null ? '' : formatSetType(set, m)}</td>
      <td>{reps ? <Bidi dir="ltr">{reps}</Bidi> : ''}</td>
      <td>{set === null ? '' : <Bidi>{formatLoad(set, m)}</Bidi>}</td>
      <td>{restSec ? <Bidi dir="ltr">{restSec}</Bidi> : ''}</td>
      <td>{rir ? <Bidi dir="ltr">{rir}</Bidi> : ''}</td>
      <td>{item.notes !== undefined ? <Bidi>{item.notes}</Bidi> : ''}</td>
      <td>
        {item.alternatives.length > 0 ? (
          <ul className={styles.list}>
            {item.alternatives.map((alt, altIndex) => (
              <li key={altIndex}>
                <Bidi dir="ltr">{alt.name}</Bidi>
              </li>
            ))}
          </ul>
        ) : (
          ''
        )}
      </td>
      <td>
        {videoUrls.length > 0 ? (
          <ul className={styles.listPlain}>
            {videoUrls.map((url, urlIndex) =>
              renderVideoUrl(url, `${itemIndex}-${setIndex}-${urlIndex}`),
            )}
          </ul>
        ) : (
          ''
        )}
      </td>
    </tr>
  ));
}

function renderDay(day: WorkoutExportDay, index: number, m: Messages) {
  const dayNumber = String(index + 1);

  if (day.kind === 'rest') {
    return (
      <section key={index} className={styles.daySection}>
        <div className={styles.dayHeader}>
          <h2 className={styles.dayTitle}>
            {m['workout.export.day']} <Bidi dir="ltr">{dayNumber}</Bidi> —{' '}
            {m['workout.export.restDay']}
            {day.title !== undefined ? (
              <>
                {' '}
                (<Bidi>{day.title}</Bidi>)
              </>
            ) : null}
          </h2>
          {day.notes !== undefined ? (
            <div className={styles.notesBlock}>
              <span className={styles.notesLabel}>
                {m['workout.export.notes']}
              </span>
              <p className={styles.notesText}>
                <Bidi>{day.notes}</Bidi>
              </p>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section key={index} className={styles.daySection}>
      <div className={styles.dayHeader}>
        <h2 className={styles.dayTitle}>
          {m['workout.export.day']} <Bidi dir="ltr">{dayNumber}</Bidi>
          {day.title !== undefined ? (
            <>
              {' '}
              — <Bidi>{day.title}</Bidi>
            </>
          ) : null}
        </h2>
        {day.notes !== undefined ? (
          <div className={styles.notesBlock}>
            <span className={styles.notesLabel}>
              {m['workout.export.notes']}
            </span>
            <p className={styles.notesText}>
              <Bidi>{day.notes}</Bidi>
            </p>
          </div>
        ) : null}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{m['print.exercise']}</th>
              <th scope="col">{m['workout.export.description']}</th>
              <th scope="col">{m['print.sets']}</th>
              <th scope="col">{m['workout.export.setType']}</th>
              <th scope="col">{m['print.reps']}</th>
              <th scope="col">{m['workout.export.load']}</th>
              <th scope="col">{m['workout.export.restSec']}</th>
              <th scope="col">{m['workout.export.rir']}</th>
              <th scope="col">{m['workout.export.notes']}</th>
              <th scope="col">{m['workout.export.alternatives']}</th>
              <th scope="col">{m['workout.export.video']}</th>
            </tr>
          </thead>
          <tbody>
            {day.items.flatMap((item, itemIndex) =>
              renderItemRows(item, itemIndex, m),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Printable workout document view for one authorized published revision.
 * Pure presentation component: route/authorization/audit wiring belongs to T039.
 */
export function WorkoutPrintView({ payload, locale }: WorkoutPrintViewProps) {
  const m = getMessages(locale);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <article lang={locale} dir={dir} className={styles.document}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{m['workout.export.plan']}</p>
        <h1 className={styles.title}>
          <Bidi>{payload.planTitle}</Bidi>
        </h1>
        <p className={styles.identity}>
          <Bidi>{payload.planIdentity}</Bidi>
        </p>

        {payload.planNotes !== undefined ? (
          <div className={styles.notesBlock}>
            <span className={styles.notesLabel}>
              {m['workout.export.notes']}
            </span>
            <p className={styles.notesText}>
              <Bidi>{payload.planNotes}</Bidi>
            </p>
          </div>
        ) : null}

        {payload.documentNotes !== undefined ? (
          <div className={styles.notesBlock}>
            <span className={styles.notesLabel}>
              {m['workout.export.notes']}
            </span>
            <p className={styles.notesText}>
              <Bidi>{payload.documentNotes}</Bidi>
            </p>
          </div>
        ) : null}
      </header>

      {payload.days.map((day, index) => renderDay(day, index, m))}
    </article>
  );
}

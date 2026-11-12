import Link from 'next/link';
import { Alert } from '../ui/Alert';
import { Bidi } from '../ui/Bidi';
import { Card } from '../ui/Card';
import type { CatalogExerciseDetailRow } from '../../lib/catalog/server';
import type { NormalizedExercise } from '../../lib/catalog/schemas';
import type { Locale } from '../../lib/design/preferences';
import { formatNumber } from '../../lib/i18n/format';
import { getMessages } from '../../lib/i18n';
import styles from './ExerciseDetailView.module.css';
import { ExerciseDetailRemove } from './ExerciseDetailRemove';
import {
  alternativeName,
  type ExerciseAlternativeOption,
} from '../../lib/catalog/exercise-editor';

export function ExerciseDetailView({
  locale,
  row,
  exercise,
  canEdit,
  canRemove,
  scope,
  workspaceId,
  alternatives = [],
}: {
  locale: Locale;
  row: CatalogExerciseDetailRow;
  exercise: NormalizedExercise;
  canEdit: boolean;
  canRemove: boolean;
  scope: 'global' | 'workspace';
  workspaceId: string | null;
  alternatives?: readonly ExerciseAlternativeOption[];
}) {
  const m = getMessages(locale);
  const effectiveFields = row.payload.effective_fields as
    Record<string, unknown> | undefined;
  const effectiveVideo = effectiveFields?.video as
    { value?: unknown } | undefined;
  const resolvedVideoUrl = row.variation?.video_url ?? effectiveVideo?.value;
  const videoUrl =
    typeof resolvedVideoUrl === 'string' ? resolvedVideoUrl : null;
  const defaults = exercise.defaults;
  const reps = defaults?.reps;
  const repText = reps
    ? reps.kind === 'fixed'
      ? formatNumber(reps.value, locale)
      : `${formatNumber(reps.min, locale)}–${formatNumber(reps.max, locale)}`
    : m['catalog.editorNone'];
  const lifecycleLabel =
    row.lifecycle_state === 'removed'
      ? m['catalog.editorLifecycleRemoved']
      : m['catalog.editorLifecycleActive'];
  const aliasesToSurvivor = row.requested_id !== row.survivor_id;

  return (
    <div className={styles.content} data-testid="exercise-detail">
      {row.lifecycle_state === 'removed' ? (
        <Alert tone="warning" title={lifecycleLabel} />
      ) : null}
      {aliasesToSurvivor ? (
        <Alert tone="info" title={m['catalog.editorLifecycleSuperseded']}>
          <p>{m['catalog.detailMergedTo']}</p>
          <Link href={`/exercise-library/${row.survivor_id}`}>
            <Bidi dir="ltr">{row.survivor_id}</Bidi>
          </Link>
        </Alert>
      ) : null}
      <Card
        as="section"
        className={styles.card}
        data-current-version={row.version}
      >
        <header className={styles.sectionHeader}>
          <div>
            <h2>{m['catalog.detailTitle']}</h2>
            <p>
              {m['catalog.editorLifecycle']}: {lifecycleLabel}
            </p>
          </div>
          {canEdit && row.lifecycle_state === 'active' && !aliasesToSurvivor ? (
            <Link
              className={styles.action}
              href={`/exercise-library/${row.survivor_id}/edit`}
            >
              {m['catalog.editAsNewVersion']}
            </Link>
          ) : null}
          {canRemove && !aliasesToSurvivor ? (
            <ExerciseDetailRemove
              locale={locale}
              scope={scope}
              workspaceId={scope === 'workspace' ? workspaceId : null}
              exerciseId={row.exercise_id}
              expectedRevision={row.lifecycle_revision}
            />
          ) : null}
        </header>
        <h3 className={styles.exerciseName}>
          <Bidi dir="auto">{exercise.names[locale] || exercise.names.en}</Bidi>
        </h3>
        <dl className={styles.details}>
          <div>
            <dt>{m['catalog.detailVersion']}</dt>
            <dd>
              <Bidi dir="ltr">{formatNumber(row.version, locale)}</Bidi>
            </dd>
          </div>
          <div>
            <dt>{m['catalog.editorPrimaryMuscle']}</dt>
            <dd>
              <Bidi dir="ltr">
                {
                  m[
                    `catalog.taxonomy.muscle.${exercise.primaryMuscle}` as keyof typeof m
                  ]
                }
              </Bidi>
            </dd>
          </div>
          <div>
            <dt>{m['catalog.editorEquipment']}</dt>
            <dd>
              <Bidi dir="ltr">
                {
                  m[
                    `catalog.taxonomy.equipment.${exercise.equipment}` as keyof typeof m
                  ]
                }
              </Bidi>
            </dd>
          </div>
          {exercise.secondaryMuscles.length ? (
            <div>
              <dt>{m['catalog.editorSecondaryMuscles']}</dt>
              <dd>
                {exercise.secondaryMuscles.map((code) => (
                  <span className={styles.inlineValue} key={code}>
                    <Bidi dir="ltr">
                      {m[`catalog.taxonomy.muscle.${code}` as keyof typeof m]}
                    </Bidi>
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>
      <Card as="section" className={styles.card}>
        <h2>{m['catalog.editorDefaultsTitle']}</h2>
        <dl className={styles.details}>
          <div>
            <dt>{m['catalog.editorReps']}</dt>
            <dd>
              <Bidi dir="ltr">{repText}</Bidi>
            </dd>
          </div>
          <div>
            <dt>{m['catalog.editorRest']}</dt>
            <dd>
              <Bidi dir="ltr">
                {defaults?.restSeconds === undefined
                  ? m['catalog.editorNone']
                  : formatNumber(defaults.restSeconds, locale)}
              </Bidi>
            </dd>
          </div>
          <div>
            <dt>{m['catalog.editorRir']}</dt>
            <dd>
              <Bidi dir="ltr">
                {defaults?.rir === undefined || defaults.rir === null
                  ? m['catalog.editorNone']
                  : formatNumber(defaults.rir, locale)}
              </Bidi>
            </dd>
          </div>
          <div className={styles.wide}>
            <dt>{m['catalog.editorAlternatives']}</dt>
            <dd>
              {defaults?.alternativeExerciseIds?.length
                ? defaults.alternativeExerciseIds.map((alternativeId) => {
                    const option = alternatives.find((item) =>
                      alternativeId.startsWith('w:')
                        ? item.kind === 'private' &&
                          item.id === alternativeId.slice(2)
                        : item.kind !== 'private' &&
                          item.id === alternativeId.replace(/^g:/, ''),
                    );
                    return (
                      <span className={styles.inlineValue} key={alternativeId}>
                        <Bidi dir="auto">
                          {option
                            ? alternativeName(option, locale)
                            : alternativeId.replace(/^[gw]:/, '')}
                        </Bidi>
                      </span>
                    );
                  })
                : m['catalog.editorNone']}
            </dd>
          </div>
        </dl>
      </Card>
      <Card as="section" className={styles.card}>
        <h2>{m['catalog.detailWorkspace']}</h2>
        {videoUrl ? (
          <div className={styles.variation}>
            <p>{m['catalog.detailVideo']}</p>
            <a href={videoUrl} rel="noopener noreferrer" target="_blank">
              {m['catalog.detailOpenVideo']}
            </a>
          </div>
        ) : (
          <p className={styles.muted}>{m['catalog.detailNoVideo']}</p>
        )}
      </Card>
    </div>
  );
}

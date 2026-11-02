'use client';

import { useId, useState, type FormEvent } from 'react';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import type { Locale } from '../../lib/design/preferences';
import { dirFor } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { interpolateNumbers } from '../../lib/i18n/format';
import {
  resetVariationForWorkspace,
  validateVideoVariationDraft,
  type VideoVariationDraft,
} from '../../lib/catalog/video-variation';
import styles from './FoodEditor.module.css';

export type VideoVariationMapping = VideoVariationDraft & { version: number };

export function VideoVariationEditor({
  locale,
  workspaces,
  exercises,
  initialWorkspaceId = '',
  initialExerciseId = '',
  mapping = null,
  onWorkspaceChange,
  onExerciseChange,
  onSubmit,
  status: externalStatus,
}: {
  locale: Locale;
  workspaces: readonly { id: string; label: string }[];
  exercises: readonly { id: string; label: string }[];
  initialWorkspaceId?: string;
  initialExerciseId?: string;
  mapping?: VideoVariationMapping | null;
  onWorkspaceChange?: (workspaceId: string) => void;
  onExerciseChange?: (workspaceId: string, exerciseId: string) => void;
  onSubmit?: (
    draft: VideoVariationDraft,
    expectedVersion: number | null,
  ) => Promise<void> | void;
  status?: 'ready' | 'saving' | 'saved' | 'error';
}) {
  const m = getMessages(locale);
  const base = useId();
  const [workspaceId, setWorkspaceId] = useState(
    mapping?.workspaceId ?? initialWorkspaceId,
  );
  const [exerciseId, setExerciseId] = useState(
    mapping?.exerciseId ?? initialExerciseId,
  );
  const [videoUrl, setVideoUrl] = useState(mapping?.videoUrl ?? '');
  const [note, setNote] = useState(mapping?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [localStatus, setLocalStatus] = useState<
    'ready' | 'saving' | 'saved' | 'error'
  >('ready');
  const status = externalStatus ?? localStatus;

  function selectWorkspace(nextId: string) {
    const blank = resetVariationForWorkspace(nextId);
    setWorkspaceId(blank.workspaceId);
    setExerciseId(blank.exerciseId);
    setVideoUrl(blank.videoUrl);
    setNote(blank.note);
    setErrors({});
    setLocalStatus('ready');
    onWorkspaceChange?.(nextId);
  }

  function selectExercise(nextId: string) {
    setExerciseId(nextId);
    setVideoUrl('');
    setNote('');
    setErrors({});
    setLocalStatus('ready');
    if (workspaceId && nextId) onExerciseChange?.(workspaceId, nextId);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'saving') return;
    const draft = { workspaceId, exerciseId, videoUrl, note };
    const nextErrors = validateVideoVariationDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setLocalStatus('saving');
    try {
      await onSubmit?.(
        draft,
        mapping?.workspaceId === workspaceId ? mapping.version : null,
      );
      if (!externalStatus) setLocalStatus('saved');
    } catch {
      if (!externalStatus) setLocalStatus('error');
    }
  }

  const errorText = (key: string) => {
    const code = errors[key];
    if (!code) return undefined;
    if (key === 'workspaceId')
      return m['catalog.videoVariationWorkspaceRequired'];
    if (key === 'exerciseId')
      return m['catalog.videoVariationExerciseRequired'];
    if (key === 'videoUrl') return m['catalog.videoVariationInvalidUrl'];
    if (code === 'too_long')
      return interpolateNumbers(
        m['catalog.videoVariationNoteTooLong'],
        { amount: 2000 },
        locale,
      );
    return m['catalog.videoVariationRequired'];
  };

  return (
    <section
      className={styles.editor}
      dir={dirFor(locale)}
      lang={locale}
      data-testid="video-variation-editor"
      aria-labelledby={`${base}-title`}
    >
      <h2 id={`${base}-title`}>{m['catalog.videoVariationTitle']}</h2>
      <p>{m['catalog.videoVariationForeignOnly']}</p>
      {status === 'error' && (
        <Alert tone="error" title={m['catalog.videoVariationUnavailable']} />
      )}
      {status === 'saved' && (
        <Alert tone="success" title={m['catalog.videoVariationSaved']} />
      )}
      <form className={styles.form} noValidate onSubmit={submit}>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label htmlFor={`${base}-workspace`}>
              {m['catalog.videoVariationWorkspace']}
            </label>
            <select
              id={`${base}-workspace`}
              value={workspaceId}
              dir="auto"
              disabled={status === 'saving'}
              aria-invalid={errors.workspaceId ? true : undefined}
              aria-describedby={
                errors.workspaceId ? `${base}-workspace-error` : undefined
              }
              onChange={(event) => selectWorkspace(event.currentTarget.value)}
            >
              <option value="">{m['catalog.foodChooseWorkspace']}</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.label}
                </option>
              ))}
            </select>
            {errors.workspaceId && (
              <p id={`${base}-workspace-error`} className={styles.error}>
                {errorText('workspaceId')}
              </p>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor={`${base}-exercise`}>
              {m['catalog.videoVariationExercise']}
            </label>
            <select
              id={`${base}-exercise`}
              value={exerciseId}
              dir="auto"
              disabled={status === 'saving'}
              aria-invalid={errors.exerciseId ? true : undefined}
              aria-describedby={
                errors.exerciseId ? `${base}-exercise-error` : undefined
              }
              onChange={(event) => selectExercise(event.currentTarget.value)}
            >
              <option value="">
                {m['catalog.videoVariationExerciseRequired']}
              </option>
              {exercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.label}
                </option>
              ))}
            </select>
            {errors.exerciseId && (
              <p id={`${base}-exercise-error`} className={styles.error}>
                {errorText('exerciseId')}
              </p>
            )}
          </div>
        </div>
        <Field
          label={m['catalog.videoVariationUrl']}
          error={errorText('videoUrl')}
          inputProps={{
            id: `${base}-url`,
            type: 'url',
            dir: 'ltr',
            inputMode: 'url',
            value: videoUrl,
            disabled: status === 'saving',
            onChange: (event) => setVideoUrl(event.currentTarget.value),
            'aria-invalid': errors.videoUrl ? true : undefined,
            'aria-describedby': errors.videoUrl
              ? `${base}-url-error`
              : undefined,
          }}
        />
        <Field
          label={m['catalog.videoVariationNote']}
          error={errorText('content')}
          inputProps={{
            id: `${base}-note`,
            type: 'text',
            maxLength: 2000,
            value: note,
            disabled: status === 'saving',
            onChange: (event) => setNote(event.currentTarget.value),
          }}
        />
        <div className={styles.actions}>
          <Button type="submit" disabled={status === 'saving'}>
            {status === 'saving'
              ? m['catalog.videoVariationSaving']
              : m['catalog.videoVariationSave']}
          </Button>
        </div>
      </form>
    </section>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { evaluateProgression } from '../../lib/forms/progression';
import { resolveFormLabel } from '../../lib/forms/types';
import {
  answersForClientProgression,
  answersForBudgetSelection,
  applicableClientAnswers,
  setClientAnswer,
} from '../../lib/forms/client-answer-state';
import { validateAnswerSet } from '../../lib/forms/validation';
import type {
  FormAnswer,
  FormAnswerSet,
  FormQuestion,
} from '../../lib/forms/validation';
import { getMessages } from '../../lib/i18n';
import { getN11Feedback } from '../../lib/forms/n11-feedback';
import { formatUiNumber } from '../../lib/i18n/format-digits';
import {
  nextAutosaveRetryDelay,
  scheduleDraftAutosave,
  withAutosaveTimeout,
} from '../../lib/forms/autosave-timing';
import type { Locale } from '../../lib/design/preferences';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { Bidi } from '../ui/Bidi';
import { TextAnswerField } from './TextAnswerField';
import Image from 'next/image';
import {
  deriveMealTimingOptions,
  resolveN12ImageSeries,
} from '../../lib/forms/progression';
import {
  CorrectionHistory,
  type AnswerHistoryEntry,
} from './CorrectionHistory';
import styles from './QuestionFlow.module.css';

export type LabeledQuestion = FormQuestion & {
  title: { en: string; ar: string };
  description?: { en: string; ar: string };
  optionLabels?: readonly { en: string; ar: string }[];
};

export function shouldAutoAdvanceAfterAnswer(
  type: FormQuestion['type'] | undefined,
) {
  return [
    'boolean',
    'singleChoice',
    'multiChoice',
    'imageChoice',
    'derivedChoice',
  ].includes(type ?? '');
}

function progressMessage(
  template: string,
  current: number,
  total: number,
  locale: Locale,
) {
  return template.split(/(\{current\}|\{total\})/g).map((part, index) => {
    if (part === '{current}')
      return (
        <Bidi key={`current-${index}`} dir="ltr">
          {formatUiNumber(current, locale)}
        </Bidi>
      );
    if (part === '{total}')
      return (
        <Bidi key={`total-${index}`} dir="ltr">
          {formatUiNumber(total, locale)}
        </Bidi>
      );
    return part;
  });
}

export type FormsClientAdapter = {
  reloadDraft: (input: { assignmentId: string }) => Promise<{
    status: 'loaded' | 'error';
    revision?: number;
    answers?: FormAnswerSet;
  }>;
  reloadSubmitted?: (input: { assignmentId: string }) => Promise<{
    status: 'loaded' | 'error';
    revision?: number;
    answers?: FormAnswerSet;
  }>;
  saveDraft: (input: {
    assignmentId: string;
    expectedRevision: number;
    answers: FormAnswerSet;
    intentKey?: string;
  }) => Promise<{
    status: 'saved' | 'conflict' | 'error' | 'retryable';
    revision?: number;
  }>;
  submit: (input: {
    assignmentId: string;
    expectedRevision: number;
    answers: FormAnswerSet;
  }) => Promise<{
    status: 'submitted' | 'conflict' | 'error';
    revision?: number;
  }>;
  correct: (input: {
    assignmentId: string;
    expectedRevision: number;
    answers: FormAnswerSet;
    remove?: string[];
  }) => Promise<{
    status: 'saved' | 'conflict' | 'error' | 'retryable';
    revision?: number;
  }>;
};

type Props = {
  locale: Locale;
  questions: readonly LabeledQuestion[];
  adapter: FormsClientAdapter;
  assignmentId: string;
  initialAnswers?: FormAnswerSet;
  profileValues?: Readonly<Record<string, string>>;
  initialRevision?: number;
  initialState?:
    'ready' | 'loading' | 'missing-required' | 'submitted' | 'conflict';
  history?: readonly AnswerHistoryEntry[];
  relationshipActive?: boolean;
};

export function QuestionFlow({
  locale,
  questions,
  adapter,
  assignmentId,
  initialAnswers = {},
  profileValues = {},
  initialRevision = 1,
  initialState = 'ready',
  history = [],
  relationshipActive = true,
}: Props) {
  const messages = getMessages(locale);
  const runtimeQuestions = useMemo(
    () =>
      questions.map(
        (question) =>
          Object.fromEntries(
            Object.entries(question).filter(
              ([key]) => key !== 'title' && key !== 'description',
            ),
          ) as unknown as FormQuestion,
      ),
    [questions],
  );
  const [answers, setAnswers] = useState<FormAnswerSet>(() =>
    applicableClientAnswers(runtimeQuestions, initialAnswers),
  );
  const [revision, setRevision] = useState(initialRevision);
  const [state, setState] = useState<
    | 'ready'
    | 'loading'
    | 'missing-required'
    | 'submitted'
    | 'saving'
    | 'saved'
    | 'conflict'
    | 'save-error'
    | 'submitting'
    | 'submit-error'
    | 'invalid-answer'
  >(initialState);
  const [hasSubmitted, setHasSubmitted] = useState(
    initialState === 'submitted',
  );
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const clearingRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const latestAnswers = useRef(answers);
  const saveRef = useRef<() => Promise<boolean>>(async () => true);
  const inFlight = useRef(false);
  const pending = useRef(false);
  const conflicted = useRef(initialState === 'conflict');
  // CR-007: a save that failed with a permanent client error ('error'
  // status) must not be re-sent automatically. The flag is cleared when
  // the user changes an answer, when a save succeeds, or when the user
  // presses the explicit retry/save control (persist(true)).
  const permanentSaveErrorRef = useRef(false);
  const wakeRetry = useRef<(() => void) | undefined>(undefined);
  const intentKey = useRef<string | undefined>(undefined);
  const revisionRef = useRef(revision);
  const dirtySince = useRef<number | undefined>(undefined);
  const [questionId, setQuestionId] = useState<string | undefined>(
    () =>
      evaluateProgression({
        questions: runtimeQuestions,
        answers: applicableClientAnswers(runtimeQuestions, initialAnswers),
      }).applicableQuestionIds[0],
  );
  const progression = useMemo(
    () =>
      evaluateProgression({
        questions: runtimeQuestions,
        answers: answersForClientProgression(
          runtimeQuestions,
          applicableClientAnswers(runtimeQuestions, answers),
        ),
        currentQuestionId: questionId,
      }),
    [answers, questionId, runtimeQuestions],
  );
  const current = progression.currentQuestion
    ? (questions.find(({ id }) => id === progression.currentQuestion?.id) ??
      null)
    : null;
  const index = current ? progression.stepQuestionIds.indexOf(current.id) : -1;
  const applicableIds = useMemo(
    () => new Set(progression.applicableQuestionIds),
    [progression.applicableQuestionIds],
  );
  const [localHistory, setLocalHistory] = useState<
    readonly AnswerHistoryEntry[]
  >([]);

  const [removedQuestionIds, setRemovedQuestionIds] = useState<Set<string>>(
    () => new Set(),
  );

  const historyEntries = useMemo(
    () => [...history, ...localHistory],
    [history, localHistory],
  );

  const visibleHistory = useMemo(
    () =>
      historyEntries.map((entry) => ({
        ...entry,
        answers: Object.fromEntries(
          Object.entries(entry.answers).filter(([questionId]) =>
            applicableIds.has(questionId),
          ),
        ),
      })),
    [applicableIds, historyEntries],
  );

  function updateAnswer(id: string, value: FormAnswer | undefined) {
    if (value === undefined) {
      if (hasSubmitted) {
        setRemovedQuestionIds((prev) => new Set(prev).add(id));
      }
    } else {
      setRemovedQuestionIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    let next = setClientAnswer(
      applicableClientAnswers(runtimeQuestions, answers),
      id,
      value,
    );
    if (id === 'N08' && typeof value === 'string') {
      next = answersForBudgetSelection(next, value);
    }
    const currentAnswers = applicableClientAnswers(runtimeQuestions, next);
    setAnswers(currentAnswers);
    latestAnswers.current = currentAnswers;
    if (inFlight.current) pending.current = true;
    else intentKey.current = crypto.randomUUID();
    if (!dirtyRef.current) dirtySince.current = Date.now();
    dirtyRef.current = true;
    setDirty(true);
    setSaveError(false);
    // The payload changed, so a previously permanent save error no longer
    // blocks autosave: the next automatic save sends the new answers.
    permanentSaveErrorRef.current = false;
    if (shouldAutoAdvanceAfterAnswer(current?.type)) {
      const nextProgression = evaluateProgression({
        questions: runtimeQuestions,
        answers: currentAnswers,
        currentQuestionId: id,
      });
      const firstMissing = nextProgression.missingRequiredQuestionIds[0];
      setQuestionId(
        firstMissing === 'N08.foods'
          ? 'N08'
          : (firstMissing ?? (id === 'N08.foods' ? 'N08' : id)),
      );
    } else {
      setQuestionId(id === 'N08.foods' ? 'N08' : id);
    }
    setState('ready');
  }

  async function handleClearAnswer(id: string) {
    if (
      !relationshipActive ||
      locked ||
      clearingRef.current ||
      submittingRef.current
    )
      return;
    const question = runtimeQuestions.find((q) => q.id === id);
    if (question?.required) return;
    clearingRef.current = true;
    setState('submitting');
    try {
      const result = await adapter.correct({
        assignmentId,
        expectedRevision: revisionRef.current,
        answers: {},
        remove: [id],
      });
      if (result.status === 'saved') {
        const nextRevision = result.revision ?? revisionRef.current + 1;
        revisionRef.current = nextRevision;
        setRevision(nextRevision);
        const baseAnswers = {
          ...(historyEntries[historyEntries.length - 1]?.answers ?? {}),
          ...latestAnswers.current,
        };
        const nextAnswers = { ...baseAnswers };
        delete nextAnswers[id];
        setAnswers(nextAnswers);
        latestAnswers.current = nextAnswers;
        setLocalHistory((prev) => [
          ...prev,
          {
            version: nextRevision,
            createdAt: new Date().toISOString(),
            answers: nextAnswers,
          },
        ]);
        setState('submitted');
      } else {
        setState(result.status === 'conflict' ? 'conflict' : 'submit-error');
      }
    } catch {
      setState('submit-error');
    } finally {
      clearingRef.current = false;
    }
  }

  async function persist(force = false) {
    if (conflicted.current) return false;
    // CR-007: after a permanent client error, do not re-send the same
    // payload automatically. Only an explicit retry (force) may try again;
    // an answer change clears the flag in updateAnswer.
    if (permanentSaveErrorRef.current && !force) return false;
    if (inFlight.current) {
      if (wakeRetry.current) wakeRetry.current();
      return false;
    }
    if (!dirtyRef.current && !force) return true;
    inFlight.current = true;
    setSaving(true);
    setSaveError(false);
    setState('saving');
    const snapshot = applicableClientAnswers(
      runtimeQuestions,
      latestAnswers.current,
    );
    const thisIntent = intentKey.current ?? crypto.randomUUID();
    intentKey.current = thisIntent;
    try {
      let retry = 0;
      while (true) {
        setSaving(true);
        let result: Awaited<ReturnType<typeof adapter.saveDraft>>;
        try {
          const operation = adapter.saveDraft({
            assignmentId,
            expectedRevision: revisionRef.current,
            answers: snapshot,
            intentKey: thisIntent,
          });
          result = await withAutosaveTimeout(operation);
        } catch {
          setSaveError(true);
          setState('save-error');
          setSaving(false);
          retry += 1;
          const delay = nextAutosaveRetryDelay(retry);
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              wakeRetry.current = undefined;
              resolve();
            }, delay);
            wakeRetry.current = () => {
              clearTimeout(timer);
              wakeRetry.current = undefined;
              resolve();
            };
          });
          continue;
        }
        if (result.status === 'conflict') {
          conflicted.current = true;
          pending.current = false;
          setState('conflict');
          return false;
        }
        if (result.status === 'saved') {
          setSaveError(false);
          permanentSaveErrorRef.current = false;
          const nextRevision = result.revision ?? revisionRef.current + 1;
          revisionRef.current = nextRevision;
          setRevision(nextRevision);
          const changedDuringSave =
            JSON.stringify(snapshot) !==
            JSON.stringify(
              applicableClientAnswers(runtimeQuestions, latestAnswers.current),
            );
          dirtyRef.current = changedDuringSave;
          setDirty(changedDuringSave);
          if (!changedDuringSave) dirtySince.current = undefined;
          setState(changedDuringSave ? 'ready' : 'saved');
          intentKey.current = changedDuringSave
            ? crypto.randomUUID()
            : undefined;
          return true;
        }
        if (result.status === 'error') {
          setSaveError(true);
          setState('save-error');
          const changedDuringSave =
            JSON.stringify(snapshot) !==
            JSON.stringify(
              applicableClientAnswers(runtimeQuestions, latestAnswers.current),
            );
          if (changedDuringSave) {
            // The user already changed an answer: the pending retry in the
            // finally block must send the new payload, so do not block it.
            intentKey.current = crypto.randomUUID();
          } else {
            // Permanent client error for the current payload: keep the
            // save-error state and stop automatic re-sends of it.
            permanentSaveErrorRef.current = true;
          }
          return false;
        }
        setSaveError(true);
        setState('save-error');
        setSaving(false);
        retry += 1;
        const delay = nextAutosaveRetryDelay(retry);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            wakeRetry.current = undefined;
            resolve();
          }, delay);
          wakeRetry.current = () => {
            clearTimeout(timer);
            wakeRetry.current = undefined;
            resolve();
          };
        });
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
      if (pending.current && !conflicted.current) {
        pending.current = false;
        void saveRef.current();
      }
    }
  }

  useEffect(() => {
    saveRef.current = hasSubmitted ? async () => true : () => persist();
  });

  useEffect(() => {
    if (
      !dirty ||
      state === 'conflict' ||
      state === 'submitted' ||
      state === 'saving' ||
      inFlight.current
    )
      return;
    return scheduleDraftAutosave(
      () => void saveRef.current(),
      dirtySince.current ?? Date.now(),
    );
  }, [answers, dirty, state]);

  useEffect(() => {
    const immediate = () => {
      if (document.visibilityState === 'hidden') void saveRef.current();
    };
    const pagehide = () => void saveRef.current();
    const beforeunload = (event: BeforeUnloadEvent) => {
      if (!dirty && !saving && !saveError) return;
      event.preventDefault();
      event.returnValue = '';
    };
    document.addEventListener('visibilitychange', immediate);
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('beforeunload', beforeunload);
    return () => {
      document.removeEventListener('visibilitychange', immediate);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('beforeunload', beforeunload);
    };
  }, [dirty, saving, saveError]);

  /**
   * CR-008: after a successful submission or correction, re-fetch the
   * submitted record with the existing loader and rebuild the
   * just-appended history entry from the server's authoritative answers
   * and revision. Silent and best-effort: when the loader is absent or
   * the fetch fails, the locally appended entry stays as-is and no error
   * state is shown for the (already successful) submission.
   */
  async function refreshSubmittedHistory(entryVersion: number) {
    const loader = adapter.reloadSubmitted;
    if (!loader) return;
    try {
      const result = await loader({ assignmentId });
      if (result.status !== 'loaded' || result.revision === undefined) return;
      const serverRevision = result.revision;
      const serverAnswers = applicableClientAnswers(
        runtimeQuestions,
        result.answers ?? {},
      );
      setLocalHistory((prev) =>
        prev.map((entry) =>
          entry.version === entryVersion
            ? {
                ...entry,
                version: serverRevision,
                answers: serverAnswers,
              }
            : entry,
        ),
      );
    } catch {
      // Keep the locally appended entry.
    }
  }

  async function reloadLatestDraft() {
    setState('loading');
    try {
      const result = await (hasSubmitted && adapter.reloadSubmitted
        ? adapter.reloadSubmitted({ assignmentId })
        : adapter.reloadDraft({ assignmentId }));
      if (result.status !== 'loaded' || result.revision === undefined) {
        setState('conflict');
        return;
      }
      const latest = applicableClientAnswers(
        runtimeQuestions,
        result.answers ?? {},
      );
      setAnswers(latest);
      latestAnswers.current = latest;
      setRevision(result.revision);
      revisionRef.current = result.revision;
      conflicted.current = false;
      dirtyRef.current = false;
      setDirty(false);
      dirtySince.current = undefined;
      setSaveError(false);
      setQuestionId(undefined);
      setState('ready');
    } catch {
      setState('conflict');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      while (inFlight.current) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (conflicted.current) return;
      if (!hasSubmitted && dirtyRef.current && !(await persist())) return;
      const submissionAnswers = applicableClientAnswers(
        runtimeQuestions,
        latestAnswers.current,
      );
      const validation = validateAnswerSet(runtimeQuestions, submissionAnswers);
      if (validation.length > 0) {
        const invalid = validation[0];
        if (invalid?.questionId) setQuestionId(invalid.questionId);
        setState(
          invalid?.code === 'answer_too_long' ? 'invalid-answer' : 'ready',
        );
        return;
      }
      const submissionProgression = evaluateProgression({
        questions: runtimeQuestions,
        answers: answersForClientProgression(
          runtimeQuestions,
          submissionAnswers,
        ),
        currentQuestionId: questionId,
      });
      if (!submissionProgression.complete) {
        setQuestionId(submissionProgression.missingRequiredQuestionIds[0]);
        setState('missing-required');
        return;
      }
      setState('submitting');
      const correctionAnswers = submissionAnswers;
      const result = hasSubmitted
        ? await adapter.correct({
            assignmentId,
            expectedRevision: revisionRef.current,
            answers: correctionAnswers,
            remove: Array.from(removedQuestionIds),
          })
        : await adapter.submit({
            assignmentId,
            expectedRevision: revisionRef.current,
            answers: submissionAnswers,
          });
      if (result.status === 'submitted' || result.status === 'saved') {
        setRemovedQuestionIds(new Set());
        if (
          hasSubmitted &&
          JSON.stringify(correctionAnswers) ===
            JSON.stringify(latestAnswers.current)
        ) {
          dirtyRef.current = false;
          setDirty(false);
          dirtySince.current = undefined;
        }
        setHasSubmitted(true);
        const nextRev = result.revision ?? revisionRef.current + 1;
        revisionRef.current = nextRev;
        setRevision(nextRev);
        setLocalHistory((prev) => [
          ...prev,
          {
            version: nextRev,
            createdAt: new Date().toISOString(),
            answers: hasSubmitted ? correctionAnswers : submissionAnswers,
          },
        ]);
        setState('submitted');
        // CR-008: refresh the just-appended history entry from the server
        // so the displayed history shows the authoritative answers and
        // revision instead of the client-side guess, without a reload.
        await refreshSubmittedHistory(nextRev);
      } else
        setState(result.status === 'conflict' ? 'conflict' : 'submit-error');
    } catch {
      setState('submit-error');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (state === 'loading') {
    return (
      <main className={styles.main} aria-busy="true">
        <p role="status">{messages['forms.loading']}</p>
      </main>
    );
  }
  if (progression.errors.length > 0) {
    return (
      <main className={styles.main}>
        <Alert tone="error" title={messages['forms.invalidForm']} />
      </main>
    );
  }

  const submitted = state === 'submitted';
  const locked = state === 'conflict' || state === 'submitting' || submitting;
  return (
    <main className={styles.main}>
      <h1>{messages['forms.title']}</h1>
      {state === 'conflict' && (
        <Alert tone="warning" title={messages['forms.conflictTitle']}>
          {messages['forms.conflictBody']}
          <Button variant="secondary" onClick={() => void reloadLatestDraft()}>
            {messages['forms.reloadDraft']}
          </Button>
        </Alert>
      )}
      {state === 'missing-required' && (
        <Alert tone="error" title={messages['forms.submitMissing']} />
      )}
      {state === 'save-error' && (
        <Alert tone="error" title={messages['forms.saveFailed']} />
      )}
      {state === 'submit-error' && (
        <Alert tone="error" title={messages['forms.submitFailed']} />
      )}
      {submitted && (
        <Alert tone="success" title={messages['forms.submitSuccess']} />
      )}
      {!submitted && current && (
        <form className={styles.flow} onSubmit={submit}>
          <p className={styles.progress}>
            {progressMessage(
              messages['forms.progress'],
              index + 1,
              progression.stepQuestionIds.length,
              locale,
            )}
          </p>
          <section
            aria-label={current.title[locale]}
            className={styles.question}
            onBlurCapture={(event) => {
              const target = event.relatedTarget;
              const submitAttempt =
                target instanceof HTMLButtonElement && target.type === 'submit';
              if (dirty && !submitAttempt) void saveRef.current();
            }}
          >
            {current.privacy === 'health' && (
              <p>{messages['forms.aboutHealthData']}</p>
            )}
            {current.type !== 'shortText' && current.type !== 'longText' && (
              <h2>{current.title[locale]}</h2>
            )}
            {current.description &&
              current.type !== 'shortText' &&
              current.type !== 'longText' && (
                <p>{current.description[locale]}</p>
              )}
            {current.required && (
              <p className={styles.required}>{messages['forms.required']}</p>
            )}
            <QuestionControl
              question={current}
              value={answers[current.id]}
              answers={answers}
              profileValue={profileValues[current.id]}
              locale={locale}
              messages={messages}
              disabled={locked}
              onChange={(value) => updateAnswer(current.id, value)}
            />
            {current.id === 'N08' &&
              progression.applicableQuestionIds.includes('N08.foods') &&
              questions.find(({ id }) => id === 'N08.foods') && (
                <QuestionControl
                  question={questions.find(({ id }) => id === 'N08.foods')!}
                  value={answers['N08.foods']}
                  answers={answers}
                  profileValue={undefined}
                  locale={locale}
                  messages={messages}
                  disabled={locked}
                  onChange={(value) => updateAnswer('N08.foods', value)}
                />
              )}
            {!current.required &&
              answers[current.id] !== undefined &&
              answers[current.id] !== '' && (
                <div className={styles.clearQuestionRow}>
                  <Button
                    variant="secondary"
                    disabled={locked}
                    aria-label={`${messages['forms.clearAnswer']}: ${current.title[locale]}`}
                    onClick={() => updateAnswer(current.id, undefined)}
                  >
                    {messages['forms.clearAnswer']}
                  </Button>
                </div>
              )}
          </section>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              disabled={locked || !progression.previousQuestionId}
              onClick={(event) => {
                event.preventDefault();
                void saveRef.current();
                setQuestionId(progression.previousQuestionId ?? undefined);
              }}
            >
              {messages['forms.previous']}
            </Button>
            {progression.nextQuestionId ? (
              <Button
                type="button"
                disabled={locked}
                onClick={(event) => {
                  event.preventDefault();
                  void saveRef.current();
                  setQuestionId(progression.nextQuestionId ?? undefined);
                }}
              >
                {messages['forms.next']}
              </Button>
            ) : (
              <Button
                type="submit"
                loading={state === 'submitting'}
                disabled={state === 'conflict' || state === 'submitting'}
              >
                {
                  messages[
                    hasSubmitted ? 'forms.saveCorrection' : 'forms.submit'
                  ]
                }
              </Button>
            )}
          </div>
          {!hasSubmitted && (
            <div className={styles.saveRow}>
              <Button
                variant="secondary"
                disabled={saving || (locked && !saveError)}
                onClick={() => void persist(true)}
              >
                {saveError
                  ? messages['forms.retrySave']
                  : messages['forms.saveNow']}
              </Button>
            </div>
          )}
        </form>
      )}
      <p
        className={styles.saveStatus}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {state === 'conflict'
          ? messages['forms.conflictTitle']
          : saving
            ? messages['forms.saving']
            : saveError
              ? messages['forms.saveFailed']
              : dirty
                ? messages['forms.unsaved']
                : state === 'saved'
                  ? messages['forms.draftSaved']
                  : ''}
      </p>
      {submitted && relationshipActive && (
        <Button variant="secondary" onClick={() => setState('ready')}>
          {messages['forms.correct']}
        </Button>
      )}
      {submitted && !relationshipActive && (
        <p>{messages['forms.correctionUnavailable']}</p>
      )}
      {visibleHistory.length > 0 && (
        <CorrectionHistory
          locale={locale}
          entries={visibleHistory}
          questions={questions}
          relationshipActive={relationshipActive}
          disabled={locked}
          onClearAnswer={handleClearAnswer}
        />
      )}
    </main>
  );
}

function QuestionControl({
  question,
  value,
  answers,
  profileValue,
  locale,
  messages,
  disabled,
  onChange,
}: {
  question: LabeledQuestion;
  value: FormAnswer | undefined;
  answers: FormAnswerSet;
  profileValue: string | undefined;
  locale: Locale;
  messages: ReturnType<typeof getMessages>;
  disabled: boolean;
  onChange: (value: FormAnswer | undefined) => void;
}) {
  const text = (value: { en: string; ar: string } | undefined) =>
    value?.[locale] ?? '';
  if (question.type === 'displayOnly') {
    return (
      <p role="note">{text(question.displayText) || question.title[locale]}</p>
    );
  }
  if (question.type === 'profileText' || question.type === 'computedAge') {
    return (
      <output
        className={styles.profileValue}
        aria-label={question.title[locale]}
      >
        <Bidi dir={question.type === 'computedAge' ? 'ltr' : 'auto'}>
          {profileValue ?? ''}
        </Bidi>
      </output>
    );
  }
  if (question.type === 'shortText' || question.type === 'longText') {
    return (
      <TextAnswerField
        kind={question.type}
        label={question.title[locale]}
        value={typeof value === 'string' ? value : ''}
        onChange={onChange}
        locale={locale}
        disabled={disabled}
        charLimit={question.charLimit}
        hint={question.description?.[locale]}
      />
    );
  }
  if (question.type === 'boolean') {
    return (
      <div
        className={styles.choices}
        role="group"
        aria-label={question.title[locale]}
      >
        {([true, false] as const).map((choice) => (
          <label key={String(choice)}>
            <input
              type="radio"
              disabled={disabled}
              name={question.id}
              checked={value === choice}
              onChange={() => onChange(choice)}
            />
            {choice ? messages['forms.yes'] : messages['forms.no']}
          </label>
        ))}
      </div>
    );
  }
  if (question.type === 'singleChoice') {
    return (
      <div
        className={styles.choices}
        role="group"
        aria-label={question.title[locale]}
      >
        {question.choices?.map((choice, index) => (
          <label key={choice}>
            <input
              type="radio"
              disabled={disabled}
              name={question.id}
              checked={value === choice}
              onChange={() => onChange(choice)}
            />
            {question.id === 'T03' && locale === 'ar' ? (
              <Bidi dir="ltr">
                {text(question.optionLabels?.[index]) || choice}
              </Bidi>
            ) : (
              text(question.optionLabels?.[index]) || choice
            )}
          </label>
        ))}
      </div>
    );
  }
  if (question.type === 'slider') {
    const minimum = question.validation?.min ?? 0;
    const maximum = question.validation?.max ?? 10;
    const step = question.validation?.step ?? 1;
    const score = typeof value === 'number' ? value : minimum;
    const feedback =
      question.id === 'N11'
        ? (getN11Feedback(score, locale) ??
          question.feedbackBands?.find(
            (band) => score >= band.min && score <= band.max,
          )?.text)
        : question.feedbackBands?.find(
            (band) => score >= band.min && score <= band.max,
          )?.text;
    return (
      <div className={styles.inputField}>
        <label htmlFor={`answer-${question.id}`}>
          {question.title[locale]}
        </label>
        <input
          id={`answer-${question.id}`}
          type="range"
          min={minimum}
          max={maximum}
          step={step}
          value={score}
          disabled={disabled}
          aria-valuetext={`${formatUiNumber(score, locale)} / ${formatUiNumber(maximum, locale)}`}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
        <output aria-live="polite">
          <Bidi dir="ltr">{formatUiNumber(score, locale)}</Bidi>/
          <Bidi dir="ltr">{formatUiNumber(maximum, locale)}</Bidi>
        </output>
        {question.labels && (
          <div className={styles.sliderLabels}>
            <span>{resolveFormLabel(question.labels.minimum, locale)}</span>
            {question.labels.middle && (
              <span>{resolveFormLabel(question.labels.middle, locale)}</span>
            )}
            <span>{resolveFormLabel(question.labels.maximum, locale)}</span>
          </div>
        )}
        {feedback && <p role="status">{feedback}</p>}
      </div>
    );
  }
  if (question.type === 'imageChoice') {
    const series = resolveN12ImageSeries(
      typeof answers.B06 === 'string'
        ? answers.B06
        : typeof answers.sex === 'string'
          ? answers.sex
          : undefined,
    );
    const allowed = (question.assetReferences ?? [])
      .map((reference, index) => ({ reference, index }))
      .filter(({ reference }) =>
        /^\/images\/body-fat\/[a-z0-9-]+\.(?:webp|avif)$/.test(reference),
      )
      .filter(({ reference }) =>
        series ? reference.includes(`/body-fat/${series}-`) : true,
      );
    return (
      <fieldset className={styles.choices}>
        <legend>{question.title[locale]}</legend>
        {allowed.map(({ reference, index }) => {
          const choice = question.choices?.[index];
          if (!choice) return null;
          const label = text(question.optionLabels?.[index]) || choice;
          return (
            <label key={reference}>
              <input
                type="radio"
                name={question.id}
                value={choice}
                disabled={disabled}
                checked={value === choice}
                onChange={() => onChange(choice)}
              />
              <Image
                src={reference}
                alt={label}
                width={384}
                height={329}
                sizes="(max-width: 40rem) 100vw, 24rem"
                style={{ maxInlineSize: '100%', blockSize: 'auto' }}
              />
              <Bidi>{label}</Bidi>
            </label>
          );
        })}
      </fieldset>
    );
  }
  if (question.type === 'mealCount' || question.type === 'derivedChoice') {
    const choices =
      question.type === 'mealCount'
        ? (question.choices ?? [])
        : deriveMealTimingOptions(
            typeof answers[question.derivedOptions?.sourceQuestionId ?? ''] ===
              'string' ||
              typeof answers[
                question.derivedOptions?.sourceQuestionId ?? ''
              ] === 'number'
              ? (answers[question.derivedOptions?.sourceQuestionId ?? ''] as
                  string | number)
              : '',
          );
    return (
      <fieldset className={styles.choices}>
        <legend>{question.title[locale]}</legend>
        {choices.map((choice, index) => {
          const label =
            question.type === 'derivedChoice' && choice.startsWith('meal-')
              ? messages['forms.afterMealNumber']
                  .split('{number}')
                  .map((part, partIndex) => (
                    <span key={`${choice}-${partIndex}`}>
                      {part}
                      {partIndex === 0 && (
                        <Bidi dir="ltr">{choice.slice(5)}</Bidi>
                      )}
                    </span>
                  ))
              : text(
                  question.optionLabels?.[
                    question.type === 'derivedChoice'
                      ? (question.choices?.indexOf(choice) ?? index)
                      : index
                  ],
                ) || choice;
          return (
            <label key={choice}>
              <input
                type="radio"
                name={question.id}
                value={choice}
                disabled={disabled}
                checked={value === choice}
                onChange={() => onChange(choice)}
              />
              {label}
            </label>
          );
        })}
      </fieldset>
    );
  }
  if (question.type === 'multiChoice') {
    const selected = Array.isArray(value) ? value : [];
    const budgetPrefix =
      question.id === 'N08.foods' && typeof answers.N08 === 'string'
        ? `${answers.N08}:`
        : undefined;
    return (
      <div
        className={styles.choices}
        role="group"
        aria-label={question.title[locale]}
      >
        {question.choices
          ?.map((choice, index) => ({ choice, index }))
          .filter(
            ({ choice }) =>
              budgetPrefix === undefined || choice.startsWith(budgetPrefix),
          )
          .map(({ choice, index }) => (
            <label key={choice}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={selected.includes(choice)}
                onChange={(event) =>
                  onChange(
                    event.currentTarget.checked
                      ? [...selected, choice]
                      : selected.filter((item) => item !== choice),
                  )
                }
              />
              {text(question.optionLabels?.[index]) || choice}
            </label>
          ))}
      </div>
    );
  }
  if (question.type === 'number' || question.type === 'date') {
    return (
      <label className={styles.inputField}>
        {question.title[locale]}
        <input
          type={question.type}
          dir="ltr"
          disabled={disabled}
          value={
            typeof value === 'string' || typeof value === 'number' ? value : ''
          }
          min={question.validation?.min}
          max={question.validation?.max}
          onChange={(event) => {
            if (
              question.type === 'number' &&
              event.currentTarget.value === ''
            ) {
              onChange(undefined);
              return;
            }
            onChange(
              question.type === 'number'
                ? Number(event.currentTarget.value)
                : event.currentTarget.value,
            );
          }}
        />
      </label>
    );
  }
  return null;
}

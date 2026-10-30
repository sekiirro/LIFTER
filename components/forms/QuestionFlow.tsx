'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { evaluateProgression } from '../../lib/forms/progression';
import {
  answersForClientProgression,
  applicableClientAnswers,
} from '../../lib/forms/client-answer-state';
import { validateAnswerSet } from '../../lib/forms/validation';
import type {
  FormAnswer,
  FormAnswerSet,
  FormQuestion,
} from '../../lib/forms/validation';
import { getMessages } from '../../lib/i18n';
import type { Locale } from '../../lib/design/preferences';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { Bidi } from '../ui/Bidi';
import { TextAnswerField } from './TextAnswerField';
import {
  CorrectionHistory,
  type AnswerHistoryEntry,
} from './CorrectionHistory';
import styles from './QuestionFlow.module.css';

export type LabeledQuestion = FormQuestion & {
  title: { en: string; ar: string };
  description?: { en: string; ar: string };
};

function progressMessage(template: string, current: number, total: number) {
  return template.split(/(\{current\}|\{total\})/g).map((part, index) => {
    if (part === '{current}')
      return (
        <Bidi key={`current-${index}`} dir="ltr">
          {current}
        </Bidi>
      );
    if (part === '{total}')
      return (
        <Bidi key={`total-${index}`} dir="ltr">
          {total}
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
  saveDraft: (input: {
    assignmentId: string;
    expectedRevision: number;
    answers: FormAnswerSet;
  }) => Promise<{ status: 'saved' | 'conflict' | 'error'; revision?: number }>;
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
  }) => Promise<{ status: 'saved' | 'conflict' | 'error'; revision?: number }>;
};

type Props = {
  locale: Locale;
  questions: readonly LabeledQuestion[];
  adapter: FormsClientAdapter;
  assignmentId: string;
  initialAnswers?: FormAnswerSet;
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
  const [questionId, setQuestionId] = useState<string | undefined>();
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
  const index = current
    ? progression.applicableQuestionIds.indexOf(current.id)
    : -1;
  const applicableIds = new Set(progression.applicableQuestionIds);
  const visibleHistory = history.map((entry) => ({
    ...entry,
    answers: Object.fromEntries(
      Object.entries(entry.answers).filter(([questionId]) =>
        applicableIds.has(questionId),
      ),
    ),
  }));

  function updateAnswer(id: string, value: FormAnswer) {
    const next = {
      ...applicableClientAnswers(runtimeQuestions, answers),
      [id]: value,
    };
    const currentAnswers = applicableClientAnswers(runtimeQuestions, next);
    setAnswers(currentAnswers);
    const nextProgression = evaluateProgression({
      questions: runtimeQuestions,
      answers: currentAnswers,
      currentQuestionId: id,
    });
    setQuestionId(nextProgression.missingRequiredQuestionIds[0] ?? id);
    setState('ready');
  }

  async function persist(correcting = false) {
    setState('saving');
    try {
      const result = correcting
        ? await adapter.correct({
            assignmentId,
            expectedRevision: revision,
            answers: applicableClientAnswers(runtimeQuestions, answers),
          })
        : await adapter.saveDraft({
            assignmentId,
            expectedRevision: revision,
            answers: applicableClientAnswers(runtimeQuestions, answers),
          });
      if (result.status === 'conflict') setState('conflict');
      else if (result.status === 'error') setState('save-error');
      else {
        setRevision(result.revision ?? revision + 1);
        setState('saved');
      }
    } catch {
      setState('save-error');
    }
  }

  async function reloadLatestDraft() {
    setState('loading');
    try {
      const result = await adapter.reloadDraft({ assignmentId });
      if (result.status !== 'loaded' || result.revision === undefined) {
        setState('save-error');
        return;
      }
      const latest = applicableClientAnswers(
        runtimeQuestions,
        result.answers ?? {},
      );
      setAnswers(latest);
      setRevision(result.revision);
      setQuestionId(undefined);
      setState('ready');
    } catch {
      setState('save-error');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateAnswerSet(
      runtimeQuestions,
      applicableClientAnswers(runtimeQuestions, answers),
    );
    if (validation.length > 0) {
      const invalid = validation[0];
      if (invalid?.questionId) setQuestionId(invalid.questionId);
      setState(
        invalid?.code === 'answer_too_long' ? 'invalid-answer' : 'ready',
      );
      return;
    }
    if (!progression.complete) {
      setQuestionId(progression.missingRequiredQuestionIds[0]);
      setState('missing-required');
      return;
    }
    setState('submitting');
    try {
      const result = hasSubmitted
        ? await adapter.correct({
            assignmentId,
            expectedRevision: revision,
            answers: applicableClientAnswers(runtimeQuestions, answers),
          })
        : await adapter.submit({
            assignmentId,
            expectedRevision: revision,
            answers,
          });
      if (result.status === 'submitted' || result.status === 'saved') {
        setHasSubmitted(true);
        if ('revision' in result && result.revision)
          setRevision(result.revision);
        setState('submitted');
      } else
        setState(result.status === 'conflict' ? 'conflict' : 'submit-error');
    } catch {
      setState('submit-error');
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
  const locked =
    state === 'conflict' || state === 'saving' || state === 'submitting';
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
              progression.applicableQuestionIds.length,
            )}
          </p>
          <section
            aria-label={current.title[locale]}
            className={styles.question}
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
              locale={locale}
              messages={messages}
              disabled={locked}
              onChange={(value) => updateAnswer(current.id, value)}
            />
          </section>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              disabled={locked || !progression.previousQuestionId}
              onClick={() =>
                setQuestionId(progression.previousQuestionId ?? undefined)
              }
            >
              {messages['forms.previous']}
            </Button>
            {progression.nextQuestionId ? (
              <Button
                type="button"
                disabled={locked}
                onClick={() =>
                  setQuestionId(progression.nextQuestionId ?? undefined)
                }
              >
                {messages['forms.next']}
              </Button>
            ) : (
              <Button
                type="submit"
                loading={state === 'submitting'}
                disabled={locked && state !== 'submitting'}
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
                disabled={locked}
                onClick={() => void persist()}
              >
                {state === 'saving'
                  ? messages['forms.saving']
                  : messages['forms.saveDraft']}
              </Button>
              {state === 'saved' && (
                <p role="status">{messages['forms.draftSaved']}</p>
              )}
            </div>
          )}
        </form>
      )}
      {submitted && relationshipActive && (
        <Button variant="secondary" onClick={() => setState('ready')}>
          {messages['forms.correct']}
        </Button>
      )}
      {submitted && !relationshipActive && (
        <p>{messages['forms.correctionUnavailable']}</p>
      )}
      {visibleHistory.length > 0 && (
        <CorrectionHistory locale={locale} entries={visibleHistory} />
      )}
    </main>
  );
}

function QuestionControl({
  question,
  value,
  locale,
  messages,
  disabled,
  onChange,
}: {
  question: LabeledQuestion;
  value: FormAnswer | undefined;
  locale: Locale;
  messages: ReturnType<typeof getMessages>;
  disabled: boolean;
  onChange: (value: FormAnswer) => void;
}) {
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
        {question.choices?.map((choice) => (
          <label key={choice}>
            <input
              type="radio"
              disabled={disabled}
              name={question.id}
              checked={value === choice}
              onChange={() => onChange(choice)}
            />
            {choice}
          </label>
        ))}
      </div>
    );
  }
  if (question.type === 'multiChoice') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div
        className={styles.choices}
        role="group"
        aria-label={question.title[locale]}
      >
        {question.choices?.map((choice) => (
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
            {choice}
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
          onChange={(event) =>
            onChange(
              question.type === 'number'
                ? Number(event.currentTarget.value)
                : event.currentTarget.value,
            )
          }
        />
      </label>
    );
  }
  return null;
}

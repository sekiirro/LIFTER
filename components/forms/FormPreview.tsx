'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Bidi } from '../ui/Bidi';
import { formatUiNumber } from '../../lib/i18n/format-digits';
import { Button } from '../ui/Button';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { TextAnswerField } from './TextAnswerField';
import {
  deriveMealTimingOptions,
  resolveN12ImageSeries,
} from '../../lib/forms/progression';
import type {
  ApplicabilityCondition,
  FormAnswer,
  FormAnswerSet,
} from '../../lib/forms/validation';
import type {
  LocalizedFormsCopy,
  StaffFormDraft,
  StaffFormQuestion,
} from '../../lib/forms/staff-contracts';
import styles from './StaffForms.module.css';

export function localizedFormCopy(
  value: LocalizedFormsCopy,
  locale: Locale,
): string {
  return value[locale]?.trim() || value.en.trim();
}

function optionText(
  question: StaffFormQuestion,
  value: string,
  locale: Locale,
): string {
  const index = question.choices?.indexOf(value) ?? -1;
  const copy = index < 0 ? undefined : question.optionLabels?.[index];
  return copy ? localizedFormCopy(copy, locale) : value;
}

export function matchesPreviewCondition(
  condition: ApplicabilityCondition,
  answers: FormAnswerSet,
): boolean {
  const answer = answers[condition.questionId];
  if (condition.operator === 'isAnswered') {
    return (
      answer !== undefined &&
      answer !== '' &&
      (!Array.isArray(answer) || answer.length > 0)
    );
  }
  if (condition.operator === 'contains') {
    return Array.isArray(answer) && answer.includes(condition.value);
  }
  if (answer === undefined || answer === '' || Array.isArray(answer))
    return false;
  return condition.operator === 'equals'
    ? Object.is(answer, condition.value)
    : !Object.is(answer, condition.value);
}

function questionVisible(
  question: StaffFormQuestion,
  byId: ReadonlyMap<string, StaffFormQuestion>,
  answers: FormAnswerSet,
  seen: ReadonlySet<string> = new Set(),
): boolean {
  if (!question.when) return true;
  if (seen.has(question.id)) return false;
  const nextSeen = new Set(seen).add(question.id);
  const results = question.when.conditions.map((condition) => {
    const dependency = byId.get(condition.questionId);
    return (
      dependency !== undefined &&
      questionVisible(dependency, byId, answers, nextSeen) &&
      matchesPreviewCondition(condition, answers)
    );
  });
  return question.when.mode === 'all'
    ? results.every(Boolean)
    : results.some(Boolean);
}

function writeAnswer(
  setAnswers: (
    update: (current: Record<string, FormAnswer>) => Record<string, FormAnswer>,
  ) => void,
  questionId: string,
  answer: FormAnswer,
) {
  setAnswers((current) => ({ ...current, [questionId]: answer }));
}

function PreviewQuestion({
  question,
  locale,
  answers,
  setAnswers,
}: {
  question: StaffFormQuestion;
  locale: Locale;
  answers: Record<string, FormAnswer>;
  setAnswers: (
    update: (current: Record<string, FormAnswer>) => Record<string, FormAnswer>,
  ) => void;
}) {
  const messages = getMessages(locale);
  const label = localizedFormCopy(question.label, locale);
  const value = answers[question.id];
  const valueText =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const choices = question.choices ?? [];
  const unit = question.unit ? localizedFormCopy(question.unit, locale) : '';

  if (question.type === 'displayOnly') {
    return (
      <p role="note">
        {question.displayText
          ? localizedFormCopy(question.displayText, locale)
          : label}
      </p>
    );
  }
  if (question.type === 'profileText' || question.type === 'computedAge') {
    return (
      <p className={styles.hint}>
        {question.type === 'profileText'
          ? messages['forms.staffReadOnlyBinding']
          : messages['forms.staffDateOfBirthBinding']}
      </p>
    );
  }
  if (question.type === 'slider') {
    const minimum = question.validation?.min ?? 0;
    const maximum = question.validation?.max ?? 10;
    const step = question.validation?.step ?? 1;
    const score = typeof value === 'number' ? value : minimum;
    const feedback = question.feedbackBands?.find(
      (band) => score >= band.min && score <= band.max,
    )?.text;
    return (
      <div className={styles.field}>
        <label htmlFor={`preview-${question.id}`}>{label}</label>
        <input
          id={`preview-${question.id}`}
          type="range"
          min={minimum}
          max={maximum}
          step={step}
          value={score}
          aria-valuetext={`${formatUiNumber(score, locale)} / ${formatUiNumber(maximum, locale)}`}
          onChange={(event) =>
            writeAnswer(
              setAnswers,
              question.id,
              Number(event.currentTarget.value),
            )
          }
        />
        <output aria-live="polite">
          <Bidi>{formatUiNumber(score, locale)}</Bidi>/
          <Bidi>{formatUiNumber(maximum, locale)}</Bidi>
        </output>
        {question.labels && (
          <div className={styles.formHeader}>
            <span>{question.labels.minimum}</span>
            {question.labels.middle && <span>{question.labels.middle}</span>}
            <span>{question.labels.maximum}</span>
          </div>
        )}
        {feedback && <p role="status">{feedback}</p>}
      </div>
    );
  }
  if (question.type === 'imageChoice') {
    const series = resolveN12ImageSeries(
      typeof answers.sex === 'string' ? answers.sex : undefined,
    );
    const references = question.assetReferences ?? [];
    const allowed = references
      .map((reference, index) => ({ reference, index }))
      .filter(({ reference }) =>
        /^\/images\/body-fat\/[a-z0-9-]+\.(?:webp|avif)$/.test(reference),
      )
      .filter(({ reference }) =>
        series ? reference.includes(`/body-fat/${series}-`) : true,
      );
    return (
      <fieldset className={styles.options}>
        <legend>{label}</legend>
        {allowed.map(({ reference, index }) => {
          const choice = choices[index];
          const optionLabel = question.optionLabels?.[index];
          const text = optionLabel
            ? localizedFormCopy(optionLabel, locale)
            : (choice ?? label);
          return (
            <label className={styles.checkField} key={reference}>
              <input
                type="radio"
                name={`preview-${question.id}`}
                value={choice}
                checked={valueText === choice}
                onChange={() =>
                  choice && writeAnswer(setAnswers, question.id, choice)
                }
              />
              <span>
                <Image
                  src={reference}
                  alt={text}
                  width={384}
                  height={329}
                  sizes="(max-width: 40rem) 100vw, 24rem"
                  style={{ maxInlineSize: '100%', blockSize: 'auto' }}
                />
                <Bidi>{text}</Bidi>
              </span>
            </label>
          );
        })}
      </fieldset>
    );
  }
  if (
    question.type === 'singleChoice' ||
    question.type === 'multiChoice' ||
    question.type === 'boolean' ||
    question.type === 'mealCount' ||
    question.type === 'derivedChoice'
  ) {
    const parentId = question.derivedOptions?.sourceQuestionId;
    const parentValue = parentId ? answers[parentId] : undefined;
    const derived =
      question.type === 'derivedChoice'
        ? deriveMealTimingOptions(
            typeof parentValue === 'number' || typeof parentValue === 'string'
              ? parentValue
              : '',
          )
        : [];
    const optionValues =
      question.type === 'derivedChoice'
        ? derived
        : question.type === 'boolean'
          ? ['yes', 'no']
          : choices;
    const selectedValues = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? [value]
        : question.type === 'boolean' && typeof value === 'boolean'
          ? [value ? 'yes' : 'no']
          : [];
    return (
      <fieldset className={styles.options}>
        <legend>{label}</legend>
        {optionValues.map((option, index) => {
          const inputType =
            question.type === 'multiChoice' ? 'checkbox' : 'radio';
          const checked = selectedValues.includes(option);
          const translated =
            question.type === 'derivedChoice' && option.startsWith('meal-')
              ? `${messages['forms.staffMealNumber']} ${option.slice(5)}`
              : question.type === 'boolean'
                ? option === 'yes'
                  ? messages['forms.staffBoolean.yes']
                  : messages['forms.staffBoolean.no']
                : optionText(question, option, locale);
          if (question.type === 'multiChoice') {
            return (
              <Button
                key={`${option}-${index}`}
                variant="secondary"
                className={checked ? styles.activeView : undefined}
                aria-pressed={checked}
                onClick={() => {
                  const next = checked
                    ? selectedValues.filter((item) => item !== option)
                    : [...selectedValues, option];
                  writeAnswer(setAnswers, question.id, next);
                }}
              >
                {translated}
              </Button>
            );
          }
          return (
            <label className={styles.checkField} key={`${option}-${index}`}>
              <input
                type={inputType}
                name={`preview-${question.id}`}
                value={option}
                checked={checked}
                onChange={() =>
                  writeAnswer(
                    setAnswers,
                    question.id,
                    question.type === 'boolean' ? option === 'yes' : option,
                  )
                }
              />
              <span>{translated}</span>
            </label>
          );
        })}
        {unit && <span className={styles.hint}>{unit}</span>}
      </fieldset>
    );
  }

  if (question.type === 'longText') {
    return (
      <TextAnswerField
        kind="longText"
        label={label}
        value={valueText}
        onChange={(answer) => writeAnswer(setAnswers, question.id, answer)}
        locale={locale}
        charLimit={question.charLimit}
      />
    );
  }
  if (question.type === 'date') {
    return (
      <label className={styles.field}>
        <span>{label}</span>
        <input
          type="date"
          value={valueText}
          onChange={(event) =>
            writeAnswer(setAnswers, question.id, event.currentTarget.value)
          }
        />
      </label>
    );
  }
  if (question.type === 'number') {
    return (
      <label className={styles.field}>
        <span>{label}</span>
        <input
          type="number"
          min={question.validation?.min}
          max={question.validation?.max}
          step={question.validation?.step ?? 'any'}
          value={valueText}
          onChange={(event) => {
            const input = event.currentTarget.value;
            writeAnswer(
              setAnswers,
              question.id,
              input === '' ? '' : Number(input),
            );
          }}
        />
        {unit && <span className={styles.hint}>{unit}</span>}
      </label>
    );
  }
  return (
    <TextAnswerField
      kind="shortText"
      label={label}
      value={valueText}
      onChange={(answer) => writeAnswer(setAnswers, question.id, answer)}
      locale={locale}
      charLimit={question.charLimit}
    />
  );
}

export function FormPreview({
  locale,
  form,
  onBack,
  onPublish,
  busy = false,
}: {
  locale: Locale;
  form: StaffFormDraft;
  onBack: () => void;
  onPublish: () => void;
  busy?: boolean;
}) {
  const messages = getMessages(locale);
  const [answers, setAnswers] = useState<Record<string, FormAnswer>>({});
  const byId = new Map(
    form.questions.map((question) => [question.id, question]),
  );
  return (
    <section className={styles.panel} aria-labelledby="forms-preview-title">
      <header className={styles.sectionHeader}>
        <div>
          <h2 id="forms-preview-title">{messages['forms.staffPreviewForm']}</h2>
          <p>{messages['forms.staffPreviewHint']}</p>
        </div>
        <div className={styles.builderActions}>
          <Button variant="secondary" onClick={onBack} disabled={busy}>
            {messages['forms.staffReturnToEdit']}
          </Button>
          <Button onClick={onPublish} loading={busy} disabled={busy}>
            {messages['forms.staffPublish']}
          </Button>
        </div>
      </header>
      <h3 dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        {localizedFormCopy(form.title, locale)}
      </h3>
      <div className={styles.sections}>
        {form.sections.map((section) => (
          <section className={styles.section} key={section.id}>
            <h3 dir={locale === 'ar' ? 'rtl' : 'ltr'}>
              {localizedFormCopy(section.title, locale)}
            </h3>
            <ol className={styles.questionList}>
              {form.questions
                .filter((question) => question.sectionId === section.id)
                .filter((question) => questionVisible(question, byId, answers))
                .map((question) => (
                  <li className={styles.question} key={question.id}>
                    <PreviewQuestion
                      question={question}
                      locale={locale}
                      answers={answers}
                      setAnswers={setAnswers}
                    />
                  </li>
                ))}
            </ol>
          </section>
        ))}
      </div>
    </section>
  );
}

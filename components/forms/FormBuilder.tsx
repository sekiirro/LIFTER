'use client';

import { useState } from 'react';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { TextAnswerField } from './TextAnswerField';
import { FormPreview } from './FormPreview';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import type {
  FormsStaffRole,
  StaffFormDraft,
  StaffFormQuestion,
} from '../../lib/forms/staff-contracts';
import {
  canAddQuestion,
  canManageWorkspaceForms,
} from '../../lib/forms/staff-policy';
import {
  APPROVED_FORM_BOUNDS,
  type ApplicabilityCondition,
  type FormAnswerType,
} from '../../lib/forms/validation';
import styles from './StaffForms.module.css';

const types: readonly FormAnswerType[] = [
  'shortText',
  'longText',
  'number',
  'singleChoice',
  'multiChoice',
  'boolean',
  'date',
  'slider',
  'imageChoice',
  'mealCount',
  'derivedChoice',
  'displayOnly',
  'profileText',
  'computedAge',
];

type QuestionPreset =
  | 'shortText'
  | 'sex'
  | 'healthNotice'
  | 'mealCount'
  | 'derivedChoice'
  | 'imageChoice';

function LocalizedEditorFields({
  englishLabel,
  arabicLabel,
  value,
  disabled,
  onChange,
}: {
  englishLabel: string;
  arabicLabel: string;
  value: { en: string; ar: string };
  disabled: boolean;
  onChange: (locale: 'en' | 'ar', value: string) => void;
}) {
  return (
    <div className={styles.localizedFields}>
      <label className={styles.field}>
        <span>{englishLabel}</span>
        <input
          value={value.en}
          dir="ltr"
          disabled={disabled}
          onChange={(event) => onChange('en', event.currentTarget.value)}
        />
      </label>
      <label className={styles.field}>
        <span>{arabicLabel}</span>
        <input
          value={value.ar}
          dir="rtl"
          disabled={disabled}
          onChange={(event) => onChange('ar', event.currentTarget.value)}
        />
      </label>
    </div>
  );
}

function uniqueQuestionId(
  base: string,
  questions: readonly StaffFormQuestion[],
) {
  if (!questions.some((question) => question.id === base)) return base;
  let suffix = 2;
  while (questions.some((question) => question.id === `${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function newQuestion(
  sectionId: string,
  questions: readonly StaffFormQuestion[],
  preset: QuestionPreset,
): StaffFormQuestion {
  const id =
    preset === 'sex'
      ? uniqueQuestionId('sex', questions)
      : preset === 'healthNotice'
        ? uniqueQuestionId('health-notice', questions)
        : preset === 'mealCount'
          ? uniqueQuestionId('N07.meal_count', questions)
          : preset === 'derivedChoice'
            ? uniqueQuestionId('N07.training_timing', questions)
            : preset === 'imageChoice'
              ? uniqueQuestionId('N12.body_fat', questions)
              : uniqueQuestionId(`question-${questions.length + 1}`, questions);
  const type: FormAnswerType =
    preset === 'sex'
      ? 'singleChoice'
      : preset === 'healthNotice'
        ? 'displayOnly'
        : preset;
  const question: StaffFormQuestion = {
    id,
    sectionId,
    type,
    required:
      preset === 'sex' || preset === 'mealCount' || preset === 'imageChoice',
    label: { en: '', ar: '' },
  };
  if (preset === 'sex') {
    return {
      ...question,
      choices: ['male', 'female'],
      optionLabels: [
        { en: '', ar: '' },
        { en: '', ar: '' },
      ],
      privacy: 'personal',
      purpose: 'n12-series',
    };
  }
  if (preset === 'healthNotice') {
    return {
      ...question,
      required: false,
      privacy: 'health',
      displayText: { en: '', ar: '' },
    };
  }
  if (preset === 'mealCount') {
    return {
      ...question,
      choices: ['2', '3', '4', '5'],
      optionLabels: ['2', '3', '4', '5'].map((value) => ({
        en: value,
        ar: value,
      })),
    };
  }
  if (preset === 'derivedChoice') {
    const parentId =
      questions.find((item) => item.type === 'mealCount')?.id ??
      'N07.meal_count';
    return {
      ...question,
      required: false,
      choices: [
        'meal-1',
        'meal-2',
        'meal-3',
        'meal-4',
        'meal-5',
        'before-first',
        'no-fixed-time',
      ],
      optionLabels: [
        { en: '', ar: '' },
        { en: '', ar: '' },
        { en: '', ar: '' },
        { en: '', ar: '' },
        { en: '', ar: '' },
        { en: 'Before the first meal', ar: 'قبل أول وجبة' },
        { en: 'No fixed meal time', ar: 'معنديش ميعاد ثابت' },
      ],
      derivedOptions: {
        sourceQuestionId: parentId,
        fixedChoices: ['before-first', 'no-fixed-time'],
      },
    };
  }
  if (preset === 'imageChoice') {
    return {
      ...question,
      choices: [],
      optionLabels: [],
      assetReferences: [],
    };
  }
  return question;
}

function configureAnswerType(
  question: StaffFormQuestion,
  type: FormAnswerType,
): StaffFormQuestion {
  const base: StaffFormQuestion = {
    ...question,
    type,
    required: ['displayOnly', 'profileText', 'computedAge'].includes(type)
      ? false
      : question.required,
    choices: undefined,
    optionLabels: undefined,
    validation: undefined,
    unit: undefined,
    labels: undefined,
    feedbackBands: undefined,
    assetReferences: undefined,
    displayText: undefined,
    profileField: undefined,
    dateOfBirthField: undefined,
    derivedOptions: undefined,
    purpose: undefined,
  };
  if (
    type === 'singleChoice' ||
    type === 'multiChoice' ||
    type === 'imageChoice' ||
    type === 'mealCount' ||
    type === 'derivedChoice'
  ) {
    return {
      ...base,
      choices: ['option-1', 'option-2'],
      optionLabels: [
        { en: '', ar: '' },
        { en: '', ar: '' },
      ],
      ...(type === 'imageChoice' ? { assetReferences: ['', ''] } : {}),
      ...(type === 'derivedChoice'
        ? {
            derivedOptions: {
              sourceQuestionId: '',
              fixedChoices: [],
            },
          }
        : {}),
    };
  }
  if (type === 'slider') {
    return {
      ...base,
      validation: { min: 0, max: 10, step: 1 },
      labels: { minimum: '', middle: '', maximum: '' },
      feedbackBands: [{ min: 0, max: 10, text: '' }],
    };
  }
  if (type === 'number') return { ...base, validation: { step: 1 } };
  if (type === 'displayOnly') {
    return {
      ...base,
      privacy: 'health',
      displayText: { en: '', ar: '' },
    };
  }
  if (type === 'profileText') {
    return { ...base, profileField: 'fullName' };
  }
  if (type === 'computedAge') {
    return { ...base, dateOfBirthField: 'dateOfBirth' };
  }
  return {
    ...base,
    charLimit: typeLimit(type),
  };
}

function typeLimit(type: FormAnswerType): number | undefined {
  if (type === 'shortText') return 150;
  if (type === 'longText') return 1_000;
  return undefined;
}

export function FormBuilder({
  locale,
  actorRole,
  form,
  allForms,
  busy = false,
  issue,
  statusMessage,
  onChange,
  onCreate,
  onSelectForm,
  onSave,
  onPublish,
  onRetire,
  onCopy,
  onIssue,
}: {
  locale: Locale;
  actorRole: FormsStaffRole;
  form: StaffFormDraft | null;
  allForms: readonly StaffFormDraft[];
  busy?: boolean;
  issue?: string;
  statusMessage?: string;
  onChange: (form: StaffFormDraft) => void;
  onCreate: () => void;
  onSelectForm: (form: StaffFormDraft) => void;
  onSave: () => void;
  onPublish: () => void;
  onRetire: () => void;
  onCopy: (formId: string) => void;
  onIssue: (message: string) => void;
}) {
  const messages = getMessages(locale);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string>>(
    {},
  );
  const [showPreview, setShowPreview] = useState(false);
  const canManage = canManageWorkspaceForms(actorRole);
  const editable = canManage && form?.status === 'draft' && !busy;

  function patchQuestion(
    index: number,
    update: (question: StaffFormQuestion) => StaffFormQuestion,
  ) {
    if (!form) return;
    onChange({
      ...form,
      questions: form.questions.map((question, questionIndex) =>
        questionIndex === index ? update(question) : question,
      ),
    });
  }

  function addSection() {
    if (!form) return;
    onChange({
      ...form,
      sections: [
        ...form.sections,
        {
          id: `section-${form.sections.length + 1}`,
          title: { en: '', ar: '' },
        },
      ],
    });
  }

  function addQuestion(
    sectionId: string,
    preset: QuestionPreset = 'shortText',
  ) {
    if (!form || !canAddQuestion(form.questions, sectionId)) {
      onIssue(messages['forms.staffQuestionLimitReached']);
      return;
    }
    const question = newQuestion(sectionId, form.questions, preset);
    if (question.type === 'shortText') question.charLimit = 150;
    onChange({ ...form, questions: [...form.questions, question] });
    onIssue('');
  }

  function moveQuestion(index: number, offset: -1 | 1) {
    if (!form) return;
    const question = form.questions[index];
    if (!question) return;
    const siblings = form.questions
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter(({ item }) => item.sectionId === question.sectionId);
    const siblingIndex = siblings.findIndex(
      ({ itemIndex }) => itemIndex === index,
    );
    const target = siblings[siblingIndex + offset]?.itemIndex;
    if (target === undefined) return;
    const questions = [...form.questions];
    [questions[index], questions[target]] = [
      questions[target]!,
      questions[index]!,
    ];
    onChange({ ...form, questions });
  }

  function moveSection(index: number, offset: -1 | 1) {
    if (!form) return;
    const target = index + offset;
    if (target < 0 || target >= form.sections.length) return;
    const sections = [...form.sections];
    [sections[index], sections[target]] = [sections[target]!, sections[index]!];
    onChange({ ...form, sections });
  }

  function removeQuestion(index: number) {
    if (!form || !window.confirm(messages['forms.staffRemoveConfirm'])) return;
    onChange({
      ...form,
      questions: form.questions.filter(
        (_, questionIndex) => questionIndex !== index,
      ),
    });
  }

  function removeSection(sectionId: string) {
    if (!form || !window.confirm(messages['forms.staffRemoveConfirm'])) return;
    onChange({
      ...form,
      sections: form.sections.filter((section) => section.id !== sectionId),
      questions: form.questions.filter(
        (question) => question.sectionId !== sectionId,
      ),
    });
  }

  return (
    <section className={styles.panel} aria-labelledby="forms-builder-title">
      <header className={styles.sectionHeader}>
        <div>
          <h2 id="forms-builder-title">{messages['forms.staffBuilder']}</h2>
          <p>{messages['forms.staffBuilderHint']}</p>
        </div>
        <Button onClick={onCreate} disabled={!canManage || busy}>
          {messages['forms.staffCreateForm']}
        </Button>
      </header>

      {allForms.length > 0 && (
        <ul
          className={styles.formList}
          aria-label={messages['forms.staffSavedForms']}
        >
          {allForms.map((savedForm) => (
            <li key={savedForm.id}>
              <Button
                variant="secondary"
                aria-current={form?.id === savedForm.id ? 'true' : undefined}
                onClick={() => onSelectForm(savedForm)}
              >
                {savedForm.title[locale] || <Bidi>{savedForm.id}</Bidi>}
                {' · '}
                {messages[`forms.staffStatus.${savedForm.status}`]}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {!form ? (
        <div className={styles.emptyState}>
          <h3>{messages['forms.staffNoDraft']}</h3>
          <p>{messages['forms.staffNoDraftHint']}</p>
        </div>
      ) : showPreview ? (
        <FormPreview
          locale={locale}
          form={form}
          busy={busy}
          onBack={() => setShowPreview(false)}
          onPublish={onPublish}
        />
      ) : (
        <div className={styles.builder}>
          <div className={styles.formHeader}>
            <p className={styles.statusLine}>
              {messages['forms.staffFormStatus']}:{' '}
              {messages[`forms.staffStatus.${form.status}`]}
            </p>
            <p className={styles.countLine}>
              {messages['forms.staffQuestionCount']}:{' '}
              <Bidi>{form.questions.length}</Bidi> /{' '}
              <Bidi>{APPROVED_FORM_BOUNDS.maxQuestionsPerForm}</Bidi>
            </p>
          </div>

          <div className={styles.localizedFields}>
            <label className={styles.field}>
              <span>{messages['forms.staffEnglishName']}</span>
              <input
                value={form.title.en}
                dir="ltr"
                disabled={!editable}
                onChange={(event) =>
                  onChange({
                    ...form,
                    title: { ...form.title, en: event.currentTarget.value },
                  })
                }
              />
            </label>
            <label className={styles.field}>
              <span>{messages['forms.staffArabicName']}</span>
              <input
                value={form.title.ar}
                dir="rtl"
                disabled={!editable}
                onChange={(event) =>
                  onChange({
                    ...form,
                    title: { ...form.title, ar: event.currentTarget.value },
                  })
                }
              />
            </label>
          </div>

          <label className={styles.field}>
            <span>{messages['forms.staffDeadlineDays']}</span>
            <select
              value={form.deadlineDays}
              disabled={!editable}
              onChange={(event) =>
                onChange({
                  ...form,
                  deadlineDays: Number(event.currentTarget.value),
                })
              }
            >
              {Array.from({ length: 14 }, (_, index) => index + 1).map(
                (days) => (
                  <option key={days} value={days}>
                    <Bidi>{days}</Bidi>
                  </option>
                ),
              )}
            </select>
            <span className={styles.hint}>
              {messages['forms.staffDeadlineHint']}
            </span>
          </label>

          <div className={styles.builderActions}>
            <Button
              variant="secondary"
              onClick={addSection}
              disabled={!editable}
            >
              {messages['forms.staffAddSection']}
            </Button>
            {form.status === 'draft' && (
              <Button onClick={onSave} loading={busy} disabled={!canManage}>
                {messages['forms.staffSaveDraft']}
              </Button>
            )}
            {form.status === 'draft' && (
              <Button onClick={() => setShowPreview(true)} disabled={!editable}>
                {messages['forms.staffPreviewForm']}
              </Button>
            )}
            {form.status === 'published' && (
              <>
                <Button variant="secondary" onClick={() => onCopy(form.id)}>
                  {messages['forms.staffCopy']}
                </Button>
                <Button
                  variant="destructive"
                  onClick={onRetire}
                  disabled={busy}
                >
                  {messages['forms.staffRetire']}
                </Button>
              </>
            )}
          </div>

          {form.sections.length === 0 ? (
            <p className={styles.hint}>
              {messages['forms.staffAddSectionHint']}
            </p>
          ) : (
            <div className={styles.sections}>
              {form.sections.map((section, sectionIndex) => {
                const questions = form.questions
                  .map((question, index) => ({ question, index }))
                  .filter(({ question }) => question.sectionId === section.id);
                return (
                  <fieldset className={styles.section} key={section.id}>
                    <legend>
                      {messages['forms.staffSection']}{' '}
                      <Bidi>{sectionIndex + 1}</Bidi>
                      <span className={styles.hint}>
                        {' '}
                        (<Bidi>{questions.length}</Bidi> /{' '}
                        <Bidi>
                          {APPROVED_FORM_BOUNDS.maxQuestionsPerSection}
                        </Bidi>
                        )
                      </span>
                    </legend>
                    <div className={styles.builderActions}>
                      <Button
                        variant="secondary"
                        onClick={() => moveSection(sectionIndex, -1)}
                        disabled={!editable || sectionIndex === 0}
                      >
                        {messages['forms.staffMoveSectionUp']}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => moveSection(sectionIndex, 1)}
                        disabled={
                          !editable || sectionIndex === form.sections.length - 1
                        }
                      >
                        {messages['forms.staffMoveSectionDown']}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => removeSection(section.id)}
                        disabled={!editable}
                      >
                        {messages['forms.staffRemoveSection']}
                      </Button>
                    </div>
                    <div className={styles.localizedFields}>
                      <label className={styles.field}>
                        <span>{messages['forms.staffEnglishSection']}</span>
                        <input
                          value={section.title.en}
                          dir="ltr"
                          disabled={!editable}
                          onChange={(event) =>
                            onChange({
                              ...form,
                              sections: form.sections.map((item) =>
                                item.id === section.id
                                  ? {
                                      ...item,
                                      title: {
                                        ...item.title,
                                        en: event.currentTarget.value,
                                      },
                                    }
                                  : item,
                              ),
                            })
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>{messages['forms.staffArabicSection']}</span>
                        <input
                          value={section.title.ar}
                          dir="rtl"
                          disabled={!editable}
                          onChange={(event) =>
                            onChange({
                              ...form,
                              sections: form.sections.map((item) =>
                                item.id === section.id
                                  ? {
                                      ...item,
                                      title: {
                                        ...item.title,
                                        ar: event.currentTarget.value,
                                      },
                                    }
                                  : item,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>

                    <ol className={styles.questionList}>
                      {questions.map(({ question, index }) => {
                        const max = typeLimit(question.type);
                        return (
                          <li className={styles.question} key={question.id}>
                            <div className={styles.localizedFields}>
                              <label className={styles.field}>
                                <span>
                                  {messages['forms.staffEnglishQuestion']}
                                </span>
                                <input
                                  value={question.label.en}
                                  dir="ltr"
                                  disabled={!editable}
                                  onChange={(event) =>
                                    patchQuestion(index, (item) => ({
                                      ...item,
                                      label: {
                                        ...item.label,
                                        en: event.currentTarget.value,
                                      },
                                    }))
                                  }
                                />
                              </label>
                              <label className={styles.field}>
                                <span>
                                  {messages['forms.staffArabicQuestion']}
                                </span>
                                <input
                                  value={question.label.ar}
                                  dir="rtl"
                                  disabled={!editable}
                                  onChange={(event) =>
                                    patchQuestion(index, (item) => ({
                                      ...item,
                                      label: {
                                        ...item.label,
                                        ar: event.currentTarget.value,
                                      },
                                    }))
                                  }
                                />
                              </label>
                            </div>
                            <label className={styles.field}>
                              <span>{messages['forms.staffQuestionId']}</span>
                              <input
                                value={question.id}
                                dir="ltr"
                                disabled={!editable}
                                onChange={(event) => {
                                  const oldId = question.id;
                                  const nextId = event.currentTarget.value;
                                  onChange({
                                    ...form,
                                    questions: form.questions.map((item) => ({
                                      ...item,
                                      ...(item.id === oldId
                                        ? { id: nextId }
                                        : {}),
                                      ...(item.derivedOptions
                                        ?.sourceQuestionId === oldId
                                        ? {
                                            derivedOptions: {
                                              ...item.derivedOptions,
                                              sourceQuestionId: nextId,
                                            },
                                          }
                                        : {}),
                                      ...(item.when
                                        ? {
                                            when: {
                                              ...item.when,
                                              conditions:
                                                item.when.conditions.map(
                                                  (condition) =>
                                                    condition.questionId ===
                                                    oldId
                                                      ? {
                                                          ...condition,
                                                          questionId: nextId,
                                                        }
                                                      : condition,
                                                ),
                                            },
                                          }
                                        : {}),
                                    })),
                                  });
                                }}
                              />
                            </label>
                            <div className={styles.questionSettings}>
                              <label className={styles.field}>
                                <span>{messages['forms.staffAnswerType']}</span>
                                <select
                                  aria-label={messages['forms.staffAnswerType']}
                                  value={question.type}
                                  disabled={!editable}
                                  onChange={(event) => {
                                    const type = event.currentTarget
                                      .value as FormAnswerType;
                                    patchQuestion(index, (item) => ({
                                      ...configureAnswerType(item, type),
                                      charLimit:
                                        typeLimit(type) === undefined
                                          ? undefined
                                          : Math.min(
                                              item.charLimit ??
                                                typeLimit(type)!,
                                              typeLimit(type)!,
                                            ),
                                    }));
                                  }}
                                >
                                  {types.map((type) => (
                                    <option
                                      key={type}
                                      value={type}
                                      disabled={
                                        (type === 'mealCount' &&
                                          question.id !== 'N07.meal_count') ||
                                        (type === 'derivedChoice' &&
                                          question.id !== 'N07.training_timing')
                                      }
                                    >
                                      {messages[`forms.answerType.${type}`]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className={styles.field}>
                                <span>{messages['forms.staffPrivacy']}</span>
                                <select
                                  value={question.privacy ?? ''}
                                  disabled={!editable}
                                  onChange={(event) =>
                                    patchQuestion(index, (item) => ({
                                      ...item,
                                      privacy:
                                        event.currentTarget.value === ''
                                          ? undefined
                                          : (event.currentTarget.value as
                                              'personal' | 'health'),
                                    }))
                                  }
                                >
                                  <option value="">
                                    {messages['forms.staffPrivacy.none']}
                                  </option>
                                  <option value="personal">
                                    {messages['forms.staffPrivacy.personal']}
                                  </option>
                                  <option value="health">
                                    {messages['forms.staffPrivacy.health']}
                                  </option>
                                </select>
                              </label>
                              <label className={styles.field}>
                                <span>{messages['forms.staffPurpose']}</span>
                                <select
                                  value={question.purpose ?? ''}
                                  disabled={!editable}
                                  onChange={(event) =>
                                    patchQuestion(index, (item) => ({
                                      ...item,
                                      purpose:
                                        event.currentTarget.value === ''
                                          ? undefined
                                          : 'n12-series',
                                    }))
                                  }
                                >
                                  <option value="">
                                    {messages['forms.staffPurpose.none']}
                                  </option>
                                  <option value="n12-series">
                                    {messages['forms.staffPurpose.n12Series']}
                                  </option>
                                </select>
                              </label>
                              {max !== undefined && (
                                <label className={styles.field}>
                                  <span>
                                    {
                                      messages[
                                        'forms.staffAnswerCharacterLimit'
                                      ]
                                    }{' '}
                                    <Bidi>1</Bidi>– <Bidi>{max}</Bidi>
                                  </span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={max}
                                    value={question.charLimit ?? max}
                                    disabled={!editable}
                                    onChange={(event) => {
                                      const parsed = Number(
                                        event.currentTarget.value,
                                      );
                                      if (
                                        Number.isInteger(parsed) &&
                                        parsed >= 1 &&
                                        parsed <= max
                                      ) {
                                        patchQuestion(index, (item) => ({
                                          ...item,
                                          charLimit: parsed,
                                        }));
                                      }
                                    }}
                                  />
                                </label>
                              )}
                              <label className={styles.checkField}>
                                <input
                                  type="checkbox"
                                  checked={question.required}
                                  disabled={
                                    !editable ||
                                    [
                                      'displayOnly',
                                      'profileText',
                                      'computedAge',
                                    ].includes(question.type)
                                  }
                                  onChange={(event) =>
                                    patchQuestion(index, (item) => ({
                                      ...item,
                                      required: event.currentTarget.checked,
                                    }))
                                  }
                                />
                                <span>{messages['forms.staffRequired']}</span>
                              </label>
                            </div>
                            <label className={styles.checkField}>
                              <input
                                type="checkbox"
                                checked={question.when !== undefined}
                                disabled={
                                  !editable || form.questions.length < 2
                                }
                                onChange={(event) => {
                                  const sources = form.questions.filter(
                                    (item) => item.id !== question.id,
                                  );
                                  patchQuestion(index, (item) => ({
                                    ...item,
                                    when: event.currentTarget.checked
                                      ? {
                                          mode: 'all',
                                          conditions: sources[0]
                                            ? [
                                                {
                                                  questionId: sources[0].id,
                                                  operator: 'isAnswered',
                                                },
                                              ]
                                            : [],
                                        }
                                      : undefined,
                                  }));
                                }}
                              />
                              <span>{messages['forms.staffConditional']}</span>
                            </label>
                            {question.when && (
                              <fieldset className={styles.options}>
                                <legend>
                                  {messages['forms.staffConditional']}
                                </legend>
                                <label className={styles.field}>
                                  <span>
                                    {messages['forms.staffConditionMode']}
                                  </span>
                                  <select
                                    value={question.when.mode}
                                    disabled={!editable}
                                    onChange={(event) =>
                                      patchQuestion(index, (item) => ({
                                        ...item,
                                        when: item.when
                                          ? {
                                              ...item.when,
                                              mode: event.currentTarget
                                                .value as 'all' | 'any',
                                            }
                                          : undefined,
                                      }))
                                    }
                                  >
                                    <option value="all">
                                      {messages['forms.staffConditionModeAll']}
                                    </option>
                                    <option value="any">
                                      {messages['forms.staffConditionModeAny']}
                                    </option>
                                  </select>
                                </label>
                                {question.when.conditions.map(
                                  (condition, conditionIndex) => (
                                    <div
                                      className={styles.localizedFields}
                                      key={conditionIndex}
                                    >
                                      <label className={styles.field}>
                                        <span>
                                          {
                                            messages[
                                              'forms.staffConditionQuestion'
                                            ]
                                          }
                                        </span>
                                        <select
                                          value={condition.questionId}
                                          disabled={!editable}
                                          onChange={(event) =>
                                            patchQuestion(index, (item) => ({
                                              ...item,
                                              when: item.when
                                                ? {
                                                    ...item.when,
                                                    conditions:
                                                      item.when.conditions.map(
                                                        (
                                                          current,
                                                          currentIndex,
                                                        ) =>
                                                          currentIndex ===
                                                          conditionIndex
                                                            ? {
                                                                questionId:
                                                                  event
                                                                    .currentTarget
                                                                    .value,
                                                                operator:
                                                                  'isAnswered',
                                                              }
                                                            : current,
                                                      ),
                                                  }
                                                : undefined,
                                            }))
                                          }
                                        >
                                          {form.questions
                                            .filter(
                                              (item) => item.id !== question.id,
                                            )
                                            .map((item) => (
                                              <option
                                                key={item.id}
                                                value={item.id}
                                              >
                                                {item.label[locale] || item.id}
                                              </option>
                                            ))}
                                        </select>
                                      </label>
                                      <label className={styles.field}>
                                        <span>
                                          {
                                            messages[
                                              'forms.staffConditionOperator'
                                            ]
                                          }
                                        </span>
                                        <select
                                          value={condition.operator}
                                          disabled={!editable}
                                          onChange={(event) => {
                                            const operator = event.currentTarget
                                              .value as
                                              | 'equals'
                                              | 'notEquals'
                                              | 'contains'
                                              | 'isAnswered';
                                            const current =
                                              question.when?.conditions[
                                                conditionIndex
                                              ];
                                            const nextCondition: ApplicabilityCondition =
                                              operator === 'isAnswered'
                                                ? {
                                                    questionId:
                                                      current?.questionId ?? '',
                                                    operator,
                                                  }
                                                : operator === 'contains'
                                                  ? {
                                                      questionId:
                                                        current?.questionId ??
                                                        '',
                                                      operator,
                                                      value:
                                                        current &&
                                                        'value' in current &&
                                                        typeof current.value ===
                                                          'string'
                                                          ? current.value
                                                          : '',
                                                    }
                                                  : {
                                                      questionId:
                                                        current?.questionId ??
                                                        '',
                                                      operator,
                                                      value:
                                                        current &&
                                                        'value' in current
                                                          ? current.value
                                                          : '',
                                                    };
                                            patchQuestion(index, (item) => ({
                                              ...item,
                                              when: item.when
                                                ? {
                                                    ...item.when,
                                                    conditions:
                                                      item.when.conditions.map(
                                                        (
                                                          current,
                                                          currentIndex,
                                                        ) =>
                                                          currentIndex ===
                                                          conditionIndex
                                                            ? nextCondition
                                                            : current,
                                                      ),
                                                  }
                                                : undefined,
                                            }));
                                          }}
                                        >
                                          <option value="equals">
                                            {
                                              messages[
                                                'forms.staffConditionEquals'
                                              ]
                                            }
                                          </option>
                                          <option value="notEquals">
                                            {
                                              messages[
                                                'forms.staffConditionNotEquals'
                                              ]
                                            }
                                          </option>
                                          <option value="contains">
                                            {
                                              messages[
                                                'forms.staffConditionContains'
                                              ]
                                            }
                                          </option>
                                          <option value="isAnswered">
                                            {
                                              messages[
                                                'forms.staffConditionIsAnswered'
                                              ]
                                            }
                                          </option>
                                        </select>
                                      </label>
                                      {condition.operator !== 'isAnswered' && (
                                        <label className={styles.field}>
                                          <span>
                                            {
                                              messages[
                                                'forms.staffConditionValue'
                                              ]
                                            }
                                          </span>
                                          <input
                                            value={String(condition.value)}
                                            disabled={!editable}
                                            onChange={(event) =>
                                              patchQuestion(index, (item) => ({
                                                ...item,
                                                when: item.when
                                                  ? {
                                                      ...item.when,
                                                      conditions:
                                                        item.when.conditions.map(
                                                          (
                                                            current,
                                                            currentIndex,
                                                          ) =>
                                                            currentIndex ===
                                                              conditionIndex &&
                                                            current.operator !==
                                                              'isAnswered'
                                                              ? {
                                                                  ...current,
                                                                  value:
                                                                    event
                                                                      .currentTarget
                                                                      .value,
                                                                }
                                                              : current,
                                                        ),
                                                    }
                                                  : undefined,
                                              }))
                                            }
                                          />
                                        </label>
                                      )}
                                      <Button
                                        variant="destructive"
                                        disabled={!editable}
                                        onClick={() =>
                                          patchQuestion(index, (item) => {
                                            const conditions =
                                              item.when?.conditions.filter(
                                                (_, currentIndex) =>
                                                  currentIndex !==
                                                  conditionIndex,
                                              ) ?? [];
                                            return {
                                              ...item,
                                              when:
                                                conditions.length > 0 &&
                                                item.when
                                                  ? { ...item.when, conditions }
                                                  : undefined,
                                            };
                                          })
                                        }
                                      >
                                        {messages['forms.staffRemoveCondition']}
                                      </Button>
                                    </div>
                                  ),
                                )}
                                <Button
                                  variant="secondary"
                                  disabled={
                                    !editable ||
                                    question.when.conditions.length >= 16
                                  }
                                  onClick={() => {
                                    const source = form.questions.find(
                                      (item) => item.id !== question.id,
                                    );
                                    if (!source) return;
                                    patchQuestion(index, (item) => ({
                                      ...item,
                                      when: item.when
                                        ? {
                                            ...item.when,
                                            conditions: [
                                              ...item.when.conditions,
                                              {
                                                questionId: source.id,
                                                operator: 'isAnswered',
                                              },
                                            ],
                                          }
                                        : undefined,
                                    }));
                                  }}
                                >
                                  {messages['forms.staffAddCondition']}
                                </Button>
                              </fieldset>
                            )}
                            {question.type === 'number' && (
                              <>
                                <LocalizedEditorFields
                                  englishLabel={
                                    messages['forms.staffUnitEnglish']
                                  }
                                  arabicLabel={
                                    messages['forms.staffUnitArabic']
                                  }
                                  value={question.unit ?? { en: '', ar: '' }}
                                  disabled={!editable}
                                  onChange={(locale, value) =>
                                    patchQuestion(index, (item) => ({
                                      ...item,
                                      unit: {
                                        ...(item.unit ?? { en: '', ar: '' }),
                                        [locale]: value,
                                      },
                                    }))
                                  }
                                />
                                <div className={styles.localizedFields}>
                                  {(
                                    [
                                      ['min', 'forms.staffMinimumValue'],
                                      ['max', 'forms.staffMaximumValue'],
                                      ['step', 'forms.staffStep'],
                                    ] as const
                                  ).map(([key, messageKey]) => (
                                    <label className={styles.field} key={key}>
                                      <span>{messages[messageKey]}</span>
                                      <input
                                        type="number"
                                        step="any"
                                        value={question.validation?.[key] ?? ''}
                                        disabled={!editable}
                                        onChange={(event) => {
                                          const value =
                                            event.currentTarget.value;
                                          patchQuestion(index, (item) => ({
                                            ...item,
                                            validation: {
                                              ...(item.validation ?? {}),
                                              [key]:
                                                value === ''
                                                  ? undefined
                                                  : Number(value),
                                            },
                                          }));
                                        }}
                                      />
                                    </label>
                                  ))}
                                </div>
                              </>
                            )}
                            {question.type === 'slider' && (
                              <>
                                <div className={styles.localizedFields}>
                                  {(
                                    [
                                      ['min', 'forms.staffMinimumValue'],
                                      ['max', 'forms.staffMaximumValue'],
                                      ['step', 'forms.staffStep'],
                                    ] as const
                                  ).map(([key, messageKey]) => (
                                    <label className={styles.field} key={key}>
                                      <span>{messages[messageKey]}</span>
                                      <input
                                        type="number"
                                        step="any"
                                        value={question.validation?.[key] ?? ''}
                                        disabled={!editable}
                                        onChange={(event) => {
                                          const value = Number(
                                            event.currentTarget.value,
                                          );
                                          if (!Number.isFinite(value)) return;
                                          patchQuestion(index, (item) => ({
                                            ...item,
                                            validation: {
                                              ...(item.validation ?? {}),
                                              [key]: value,
                                            },
                                          }));
                                        }}
                                      />
                                    </label>
                                  ))}
                                </div>
                                <div className={styles.localizedFields}>
                                  {(
                                    [
                                      ['minimum', 'forms.staffMinimumLabel'],
                                      ['middle', 'forms.staffMiddleLabel'],
                                      ['maximum', 'forms.staffMaximumLabel'],
                                    ] as const
                                  ).map(([key, messageKey]) => (
                                    <label className={styles.field} key={key}>
                                      <span>{messages[messageKey]}</span>
                                      <input
                                        value={question.labels?.[key] ?? ''}
                                        dir={locale === 'ar' ? 'rtl' : 'ltr'}
                                        disabled={!editable}
                                        onChange={(event) =>
                                          patchQuestion(index, (item) => ({
                                            ...item,
                                            labels: {
                                              minimum:
                                                item.labels?.minimum ?? '',
                                              middle: item.labels?.middle ?? '',
                                              maximum:
                                                item.labels?.maximum ?? '',
                                              [key]: event.currentTarget.value,
                                            },
                                          }))
                                        }
                                      />
                                    </label>
                                  ))}
                                </div>
                                <fieldset className={styles.options}>
                                  <legend>
                                    {messages['forms.staffFeedbackBands']}
                                  </legend>
                                  {(question.feedbackBands ?? []).map(
                                    (band, bandIndex) => (
                                      <div
                                        className={styles.localizedFields}
                                        key={bandIndex}
                                      >
                                        <label className={styles.field}>
                                          <span>
                                            {
                                              messages[
                                                'forms.staffMinimumValue'
                                              ]
                                            }
                                          </span>
                                          <input
                                            type="number"
                                            value={band.min}
                                            disabled={!editable}
                                            onChange={(event) =>
                                              patchQuestion(index, (item) => ({
                                                ...item,
                                                feedbackBands:
                                                  item.feedbackBands?.map(
                                                    (current, currentIndex) =>
                                                      currentIndex === bandIndex
                                                        ? {
                                                            ...current,
                                                            min: Number(
                                                              event
                                                                .currentTarget
                                                                .value,
                                                            ),
                                                          }
                                                        : current,
                                                  ),
                                              }))
                                            }
                                          />
                                        </label>
                                        <label className={styles.field}>
                                          <span>
                                            {
                                              messages[
                                                'forms.staffMaximumValue'
                                              ]
                                            }
                                          </span>
                                          <input
                                            type="number"
                                            value={band.max}
                                            disabled={!editable}
                                            onChange={(event) =>
                                              patchQuestion(index, (item) => ({
                                                ...item,
                                                feedbackBands:
                                                  item.feedbackBands?.map(
                                                    (current, currentIndex) =>
                                                      currentIndex === bandIndex
                                                        ? {
                                                            ...current,
                                                            max: Number(
                                                              event
                                                                .currentTarget
                                                                .value,
                                                            ),
                                                          }
                                                        : current,
                                                  ),
                                              }))
                                            }
                                          />
                                        </label>
                                        <label className={styles.field}>
                                          <span>
                                            {
                                              messages[
                                                'forms.staffFeedbackText'
                                              ]
                                            }
                                          </span>
                                          <input
                                            value={band.text}
                                            dir={
                                              locale === 'ar' ? 'rtl' : 'ltr'
                                            }
                                            disabled={!editable}
                                            onChange={(event) =>
                                              patchQuestion(index, (item) => ({
                                                ...item,
                                                feedbackBands:
                                                  item.feedbackBands?.map(
                                                    (current, currentIndex) =>
                                                      currentIndex === bandIndex
                                                        ? {
                                                            ...current,
                                                            text: event
                                                              .currentTarget
                                                              .value,
                                                          }
                                                        : current,
                                                  ),
                                              }))
                                            }
                                          />
                                        </label>
                                        <Button
                                          variant="destructive"
                                          disabled={
                                            !editable ||
                                            (question.feedbackBands?.length ??
                                              0) <= 1
                                          }
                                          onClick={() =>
                                            patchQuestion(index, (item) => ({
                                              ...item,
                                              feedbackBands:
                                                item.feedbackBands?.filter(
                                                  (_, currentIndex) =>
                                                    currentIndex !== bandIndex,
                                                ),
                                            }))
                                          }
                                        >
                                          {messages['forms.staffRemoveOption']}
                                        </Button>
                                      </div>
                                    ),
                                  )}
                                  <Button
                                    variant="secondary"
                                    disabled={
                                      !editable ||
                                      (question.feedbackBands?.length ?? 0) >=
                                        16
                                    }
                                    onClick={() =>
                                      patchQuestion(index, (item) => ({
                                        ...item,
                                        feedbackBands: [
                                          ...(item.feedbackBands ?? []),
                                          { min: 0, max: 0, text: '' },
                                        ],
                                      }))
                                    }
                                  >
                                    {messages['forms.staffAddFeedbackBand']}
                                  </Button>
                                </fieldset>
                              </>
                            )}
                            {question.type === 'displayOnly' && (
                              <LocalizedEditorFields
                                englishLabel={
                                  messages['forms.staffDisplayTextEnglish']
                                }
                                arabicLabel={
                                  messages['forms.staffDisplayTextArabic']
                                }
                                value={
                                  question.displayText ?? { en: '', ar: '' }
                                }
                                disabled={!editable}
                                onChange={(locale, value) =>
                                  patchQuestion(index, (item) => ({
                                    ...item,
                                    displayText: {
                                      ...(item.displayText ?? {
                                        en: '',
                                        ar: '',
                                      }),
                                      [locale]: value,
                                    },
                                  }))
                                }
                              />
                            )}
                            {question.type === 'profileText' && (
                              <label className={styles.field}>
                                <span>
                                  {messages['forms.staffProfileField']}
                                </span>
                                <select
                                  value={question.profileField ?? 'fullName'}
                                  disabled={!editable}
                                  onChange={(event) =>
                                    patchQuestion(index, (item) => ({
                                      ...item,
                                      profileField: event.currentTarget
                                        .value as 'fullName',
                                    }))
                                  }
                                >
                                  <option value="fullName">
                                    {
                                      messages[
                                        'forms.staffProfileField.fullName'
                                      ]
                                    }
                                  </option>
                                </select>
                              </label>
                            )}
                            {question.type === 'computedAge' && (
                              <label className={styles.field}>
                                <span>
                                  {messages['forms.staffDateOfBirthField']}
                                </span>
                                <select
                                  value={
                                    question.dateOfBirthField ?? 'dateOfBirth'
                                  }
                                  disabled={!editable}
                                  onChange={() =>
                                    patchQuestion(index, (item) => ({
                                      ...item,
                                      dateOfBirthField: 'dateOfBirth',
                                    }))
                                  }
                                >
                                  <option value="dateOfBirth">
                                    {
                                      messages[
                                        'forms.staffDateOfBirthField.dateOfBirth'
                                      ]
                                    }
                                  </option>
                                </select>
                              </label>
                            )}
                            {question.type === 'derivedChoice' && (
                              <fieldset className={styles.options}>
                                <legend>
                                  {messages['forms.staffDerivedFromQuestion']}
                                </legend>
                                <label className={styles.field}>
                                  <span>
                                    {messages['forms.staffDerivedFromQuestion']}
                                  </span>
                                  <select
                                    value={
                                      question.derivedOptions
                                        ?.sourceQuestionId ?? ''
                                    }
                                    disabled={!editable}
                                    onChange={(event) =>
                                      patchQuestion(index, (item) => ({
                                        ...item,
                                        derivedOptions: {
                                          sourceQuestionId:
                                            event.currentTarget.value,
                                          fixedChoices:
                                            item.derivedOptions?.fixedChoices ??
                                            [],
                                        },
                                      }))
                                    }
                                  >
                                    {form.questions
                                      .filter(
                                        (item) => item.type === 'mealCount',
                                      )
                                      .map((item) => (
                                        <option key={item.id} value={item.id}>
                                          {item.label[locale] || item.id}
                                        </option>
                                      ))}
                                  </select>
                                </label>
                                <div className={styles.hint}>
                                  {messages['forms.staffFixedChoices']}:{' '}
                                  {(
                                    question.derivedOptions?.fixedChoices ?? []
                                  ).map((choice, choiceIndex) => (
                                    <span key={choice}>
                                      {choiceIndex > 0 ? ' · ' : ''}
                                      <Bidi>{choice}</Bidi>
                                    </span>
                                  ))}
                                </div>
                              </fieldset>
                            )}
                            {question.type === 'singleChoice' ||
                            question.type === 'multiChoice' ||
                            question.type === 'imageChoice' ||
                            question.type === 'mealCount' ||
                            question.type === 'derivedChoice' ? (
                              <fieldset className={styles.options}>
                                <legend>
                                  {messages['forms.staffChoices']}
                                </legend>
                                {(question.optionLabels ?? []).map(
                                  (option, optionIndex) => (
                                    <div
                                      className={styles.builder}
                                      key={`option-${optionIndex}`}
                                    >
                                      <label className={styles.field}>
                                        <span>
                                          {messages['forms.staffChoiceValue']}
                                        </span>
                                        <input
                                          value={
                                            question.choices?.[optionIndex] ??
                                            ''
                                          }
                                          dir="ltr"
                                          disabled={
                                            !editable ||
                                            question.type === 'mealCount' ||
                                            question.type === 'derivedChoice'
                                          }
                                          onChange={(event) =>
                                            patchQuestion(index, (item) => ({
                                              ...item,
                                              choices: item.choices?.map(
                                                (choice, choiceIndex) =>
                                                  choiceIndex === optionIndex
                                                    ? event.currentTarget.value
                                                    : choice,
                                              ),
                                            }))
                                          }
                                        />
                                      </label>
                                      <label className={styles.field}>
                                        <span>
                                          {messages['forms.staffEnglishOption']}
                                        </span>
                                        <input
                                          value={option.en}
                                          dir="ltr"
                                          disabled={!editable}
                                          onChange={(event) =>
                                            patchQuestion(index, (item) => ({
                                              ...item,
                                              optionLabels:
                                                item.optionLabels?.map(
                                                  (label, labelIndex) =>
                                                    labelIndex === optionIndex
                                                      ? {
                                                          ...label,
                                                          en: event
                                                            .currentTarget
                                                            .value,
                                                        }
                                                      : label,
                                                ),
                                            }))
                                          }
                                        />
                                      </label>
                                      <label className={styles.field}>
                                        <span>
                                          {messages['forms.staffArabicOption']}
                                        </span>
                                        <input
                                          value={option.ar}
                                          dir="rtl"
                                          disabled={!editable}
                                          onChange={(event) =>
                                            patchQuestion(index, (item) => ({
                                              ...item,
                                              optionLabels:
                                                item.optionLabels?.map(
                                                  (label, labelIndex) =>
                                                    labelIndex === optionIndex
                                                      ? {
                                                          ...label,
                                                          ar: event
                                                            .currentTarget
                                                            .value,
                                                        }
                                                      : label,
                                                ),
                                            }))
                                          }
                                        />
                                      </label>
                                      {question.type === 'imageChoice' && (
                                        <label className={styles.field}>
                                          <span>
                                            {
                                              messages[
                                                'forms.staffAssetReference'
                                              ]
                                            }
                                          </span>
                                          <input
                                            value={
                                              question.assetReferences?.[
                                                optionIndex
                                              ] ?? ''
                                            }
                                            dir="ltr"
                                            disabled={!editable}
                                            onChange={(event) =>
                                              patchQuestion(index, (item) => ({
                                                ...item,
                                                assetReferences:
                                                  item.assetReferences?.map(
                                                    (
                                                      reference,
                                                      referenceIndex,
                                                    ) =>
                                                      referenceIndex ===
                                                      optionIndex
                                                        ? event.currentTarget
                                                            .value
                                                        : reference,
                                                  ),
                                              }))
                                            }
                                          />
                                        </label>
                                      )}
                                      {(question.type === 'singleChoice' ||
                                        question.type === 'multiChoice' ||
                                        question.type === 'imageChoice') && (
                                        <Button
                                          variant="destructive"
                                          disabled={
                                            !editable ||
                                            (question.choices?.length ?? 0) <= 1
                                          }
                                          onClick={() =>
                                            patchQuestion(index, (item) => ({
                                              ...item,
                                              choices: item.choices?.filter(
                                                (_, currentIndex) =>
                                                  currentIndex !== optionIndex,
                                              ),
                                              optionLabels:
                                                item.optionLabels?.filter(
                                                  (_, currentIndex) =>
                                                    currentIndex !==
                                                    optionIndex,
                                                ),
                                              assetReferences:
                                                item.assetReferences?.filter(
                                                  (_, currentIndex) =>
                                                    currentIndex !==
                                                    optionIndex,
                                                ),
                                            }))
                                          }
                                        >
                                          {messages['forms.staffRemoveOption']}
                                        </Button>
                                      )}
                                    </div>
                                  ),
                                )}
                                <Button
                                  variant="secondary"
                                  disabled={
                                    !editable ||
                                    (question.type !== 'singleChoice' &&
                                      question.type !== 'multiChoice' &&
                                      question.type !== 'imageChoice') ||
                                    (question.optionLabels?.length ?? 0) >= 50
                                  }
                                  onClick={() =>
                                    patchQuestion(index, (item) => ({
                                      ...item,
                                      choices: [
                                        ...(item.choices ?? []),
                                        `option-${(item.choices?.length ?? 0) + 1}`,
                                      ],
                                      optionLabels: [
                                        ...(item.optionLabels ?? []),
                                        { en: '', ar: '' },
                                      ],
                                      ...(item.type === 'imageChoice'
                                        ? {
                                            assetReferences: [
                                              ...(item.assetReferences ?? []),
                                              '',
                                            ],
                                          }
                                        : {}),
                                    }))
                                  }
                                >
                                  {messages['forms.staffAddOption']}
                                </Button>
                              </fieldset>
                            ) : max !== undefined ? (
                              <TextAnswerField
                                kind={question.type as 'shortText' | 'longText'}
                                label={
                                  question.label[locale] ||
                                  messages['forms.staffAnswerPreview']
                                }
                                value={previewAnswers[question.id] ?? ''}
                                onChange={(value) =>
                                  setPreviewAnswers((current) => ({
                                    ...current,
                                    [question.id]: value,
                                  }))
                                }
                                locale={locale}
                                charLimit={question.charLimit}
                                disabled={!editable}
                              />
                            ) : null}
                            <div className={styles.builderActions}>
                              <Button
                                variant="secondary"
                                onClick={() => moveQuestion(index, -1)}
                                disabled={
                                  !editable || questions[0]?.index === index
                                }
                              >
                                {messages['forms.staffMoveQuestionUp']}
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => moveQuestion(index, 1)}
                                disabled={
                                  !editable ||
                                  questions[questions.length - 1]?.index ===
                                    index
                                }
                              >
                                {messages['forms.staffMoveQuestionDown']}
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={() => removeQuestion(index)}
                                disabled={!editable}
                              >
                                {messages['forms.staffRemoveQuestion']}
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    <Button
                      variant="secondary"
                      onClick={() => addQuestion(section.id)}
                      disabled={
                        !editable ||
                        form.questions.length >=
                          APPROVED_FORM_BOUNDS.maxQuestionsPerForm
                      }
                    >
                      {messages['forms.staffAddQuestion']}
                    </Button>
                    <div
                      className={styles.builderActions}
                      role="group"
                      aria-label={messages['forms.staffAnswerType']}
                    >
                      <Button
                        variant="secondary"
                        onClick={() => addQuestion(section.id, 'sex')}
                        disabled={
                          !editable ||
                          form.questions.length >=
                            APPROVED_FORM_BOUNDS.maxQuestionsPerForm ||
                          questions.length >=
                            APPROVED_FORM_BOUNDS.maxQuestionsPerSection
                        }
                      >
                        {messages['forms.staffAddSexSelector']}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => addQuestion(section.id, 'healthNotice')}
                        disabled={!editable}
                      >
                        {messages['forms.staffAddHealthNotice']}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => addQuestion(section.id, 'mealCount')}
                        disabled={!editable}
                      >
                        {messages['forms.staffAddMealCount']}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => addQuestion(section.id, 'derivedChoice')}
                        disabled={!editable}
                      >
                        {messages['forms.staffAddDerivedChoice']}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => addQuestion(section.id, 'imageChoice')}
                        disabled={!editable}
                      >
                        {messages['forms.staffAddImageChoice']}
                      </Button>
                    </div>
                  </fieldset>
                );
              })}
            </div>
          )}
        </div>
      )}

      {issue && (
        <p className={styles.error} role="alert">
          {issue}
        </p>
      )}
      {statusMessage && (
        <p className={styles.success} role="status">
          {statusMessage}
        </p>
      )}
      {!canManage && (
        <p className={styles.error} role="status">
          {messages['forms.staffSalesDenied']}
        </p>
      )}
    </section>
  );
}

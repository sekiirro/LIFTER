'use client';

import { useState } from 'react';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { TextAnswerField } from './TextAnswerField';
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
  type FormAnswerType,
} from '../../lib/forms/validation';
import styles from './StaffForms.module.css';

type ExistingEditorAnswerType = Extract<
  FormAnswerType,
  | 'shortText'
  | 'longText'
  | 'number'
  | 'singleChoice'
  | 'multiChoice'
  | 'boolean'
  | 'date'
>;

const types: readonly ExistingEditorAnswerType[] = [
  'shortText',
  'longText',
  'number',
  'singleChoice',
  'multiChoice',
  'boolean',
  'date',
];

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

  function addQuestion(sectionId: string) {
    if (!form || !canAddQuestion(form.questions, sectionId)) {
      onIssue(messages['forms.staffQuestionLimitReached']);
      return;
    }
    const question: StaffFormQuestion = {
      id: `question-${form.questions.length + 1}`,
      sectionId,
      type: 'shortText',
      required: false,
      charLimit: 150,
      label: { en: '', ar: '' },
    };
    onChange({ ...form, questions: [...form.questions, question] });
    onIssue('');
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
              <Button onClick={onPublish} disabled={!canManage || busy}>
                {messages['forms.staffPublish']}
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
                                    const nextLimit = typeLimit(type);
                                    patchQuestion(index, (item) => ({
                                      ...item,
                                      type,
                                      ...(type === 'singleChoice' ||
                                      type === 'multiChoice'
                                        ? {
                                            choices: item.choices ?? [
                                              'option-1',
                                              'option-2',
                                            ],
                                            optionLabels: item.optionLabels ?? [
                                              { en: '', ar: '' },
                                              { en: '', ar: '' },
                                            ],
                                          }
                                        : {
                                            choices: undefined,
                                            optionLabels: undefined,
                                          }),
                                      ...(nextLimit === undefined
                                        ? { charLimit: undefined }
                                        : {
                                            charLimit: Math.min(
                                              item.charLimit ?? nextLimit,
                                              nextLimit,
                                            ),
                                          }),
                                    }));
                                  }}
                                >
                                  {types.map((type) => (
                                    <option key={type} value={type}>
                                      {messages[`forms.answerType.${type}`]}
                                    </option>
                                  ))}
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
                                  disabled={!editable}
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
                            {question.type === 'singleChoice' ||
                            question.type === 'multiChoice' ? (
                              <fieldset className={styles.options}>
                                <legend>
                                  {messages['forms.staffChoices']}
                                </legend>
                                {(question.optionLabels ?? []).map(
                                  (option, optionIndex) => (
                                    <div
                                      className={styles.localizedFields}
                                      key={`option-${optionIndex}`}
                                    >
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
                                    </div>
                                  ),
                                )}
                                <Button
                                  variant="secondary"
                                  disabled={
                                    !editable ||
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

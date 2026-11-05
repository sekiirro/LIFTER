import type {
  ApplicabilityCondition,
  ApplicabilityRule,
  FormAnswer,
  FormQuestion,
  FormAnswerType,
} from './types';
export type {
  ApplicabilityCondition,
  ApplicabilityRule,
  AnswerableFormType,
  ConditionValue,
  FormAnswer,
  FormAnswerSet,
  FormAnswerType,
  FormFeedbackBand,
  FormQuestion,
  FormValidationRules,
  LocalizedFormText,
} from './types';

export const APPROVED_FORM_BOUNDS = {
  maxQuestionsPerSection: 20,
  maxQuestionsPerForm: 60,
  maxConditions: 400,
  maxConditionsPerQuestion: 16,
  maxEvaluationSteps: 4_000,
  maxDefinitionBytes: 131_072,
  // Serialized answer values only; see measureAnswerPayloadBytes below.
  maxPayloadBytes: 262_144,
  maxTextBytes: 4_096,
  maxChoices: 50,
} as const;

const UTF8_ENCODER = new TextEncoder();

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).length;
}

/** UTF-8 byte length of a textual answer, independent of its character limit. */
export function measureTextAnswerBytes(value: string): number {
  return utf8ByteLength(value);
}

/**
 * Count serialized answer-content bytes only: sum UTF-8 bytes of each JSON
 * serialized answer value. Question IDs/object keys, request envelope fields,
 * JSON object punctuation between fields, and transport framing are excluded.
 */
export function measureAnswerPayloadBytes(
  answers: Readonly<Record<string, unknown>>,
): number {
  let bytes = 0;
  for (const answer of Object.values(answers)) {
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(answer);
    } catch {
      return APPROVED_FORM_BOUNDS.maxPayloadBytes + 1;
    }
    if (serialized === undefined)
      return APPROVED_FORM_BOUNDS.maxPayloadBytes + 1;
    bytes += utf8ByteLength(serialized);
  }
  return bytes;
}

/** Shared code-point counter used by validation and the live UI counter. */
export function countTextAnswer(
  value: string,
  limit: number,
): { used: number; limit: number; remaining: number; over: boolean } {
  const used = [...value].length;
  return { used, limit, remaining: limit - used, over: used > limit };
}

function textTypeLimit(type: FormAnswerType): number | undefined {
  if (type === 'shortText') return 150;
  if (type === 'longText') return 1_000;
  return undefined;
}

export type FormValidationIssue = {
  code: string;
  questionId?: string;
};

const ANSWER_TYPES = new Set<FormAnswerType>([
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
]);

const NON_ANSWER_TYPES = new Set<FormAnswerType>([
  'displayOnly',
  'profileText',
  'computedAge',
]);

const QUESTION_KEYS = new Set([
  'id',
  'sectionId',
  'type',
  'required',
  'charLimit',
  'choices',
  'optionLabels',
  'validation',
  'when',
  'privacy',
  'purpose',
  'unit',
  'labels',
  'feedbackBands',
  'assetReferences',
  'displayText',
  'profileField',
  'dateOfBirthField',
  'derivedOptions',
]);
export const QUESTION_PRESENTATION_KEYS = new Set([
  'label',
  'title',
  'description',
]);
const VALIDATION_KEYS = new Set([
  'minLength',
  'maxLength',
  'min',
  'max',
  'step',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isLocalizedText(value: unknown): value is { en: string; ar: string } {
  return (
    isPlainRecord(value) &&
    hasOnlyDataProperties(value) &&
    Object.keys(value).length === 2 &&
    typeof value.en === 'string' &&
    typeof value.ar === 'string' &&
    utf8ByteLength(value.en) <= APPROVED_FORM_BOUNDS.maxTextBytes &&
    utf8ByteLength(value.ar) <= APPROVED_FORM_BOUNDS.maxTextBytes
  );
}

function isFeedbackBands(
  value: unknown,
): value is NonNullable<FormQuestion['feedbackBands']> {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (band) =>
        isPlainRecord(band) &&
        hasOnlyDataProperties(band) &&
        typeof band.min === 'number' &&
        Number.isFinite(band.min) &&
        typeof band.max === 'number' &&
        Number.isFinite(band.max) &&
        band.min <= band.max &&
        typeof band.text === 'string' &&
        band.text.length > 0 &&
        utf8ByteLength(band.text) <= APPROVED_FORM_BOUNDS.maxTextBytes,
    )
  );
}

function isSliderLabels(
  value: unknown,
): value is NonNullable<FormQuestion['labels']> {
  const isLabel = (label: unknown) => {
    if (typeof label === 'string')
      return (
        label.length > 0 &&
        utf8ByteLength(label) <= APPROVED_FORM_BOUNDS.maxTextBytes
      );
    return (
      isPlainRecord(label) &&
      hasOnlyDataProperties(label) &&
      Object.keys(label).every((key) => key === 'en' || key === 'ar') &&
      typeof label.en === 'string' &&
      label.en.length > 0 &&
      utf8ByteLength(label.en) <= APPROVED_FORM_BOUNDS.maxTextBytes &&
      typeof label.ar === 'string' &&
      label.ar.length > 0 &&
      utf8ByteLength(label.ar) <= APPROVED_FORM_BOUNDS.maxTextBytes
    );
  };
  return (
    isPlainRecord(value) &&
    hasOnlyDataProperties(value) &&
    Object.keys(value).every((key) =>
      ['minimum', 'middle', 'maximum'].includes(key),
    ) &&
    ['minimum', 'middle', 'maximum'].every((key) => isLabel(value[key]))
  );
}

function isValidSliderConfiguration(question: FormQuestion): boolean {
  const minimum = question.validation?.min;
  const maximum = question.validation?.max;
  const step = question.validation?.step;
  const bands = question.feedbackBands;
  if (
    typeof minimum !== 'number' ||
    typeof maximum !== 'number' ||
    typeof step !== 'number' ||
    !isSliderLabels(question.labels) ||
    !isFeedbackBands(bands) ||
    bands[0]?.min !== minimum ||
    bands.at(-1)?.max !== maximum
  ) {
    return false;
  }
  return bands.every((band, index) => {
    const previous = bands[index - 1];
    return (
      band.min >= minimum &&
      band.max <= maximum &&
      band.min <= band.max &&
      (previous === undefined ||
        Math.abs(band.min - (previous.max + step)) <= 1e-9)
    );
  });
}

function hasOnlyDataProperties(value: Record<string, unknown>): boolean {
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && 'value' in descriptor;
  });
}

function allowedKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,64}$/.test(value);
}

function compatibleCondition(
  source: FormQuestion,
  condition: ApplicabilityCondition,
): boolean {
  if (condition.operator === 'isAnswered') return true;
  if (condition.operator === 'contains') {
    return (
      source.type === 'multiChoice' &&
      typeof condition.value === 'string' &&
      source.choices?.includes(condition.value) === true
    );
  }

  switch (source.type) {
    case 'shortText':
    case 'longText':
    case 'singleChoice':
    case 'imageChoice':
    case 'mealCount':
    case 'derivedChoice':
    case 'date':
      return typeof condition.value === 'string';
    case 'number':
    case 'slider':
      return (
        typeof condition.value === 'number' && Number.isFinite(condition.value)
      );
    case 'boolean':
      return typeof condition.value === 'boolean';
    case 'multiChoice':
    case 'displayOnly':
    case 'profileText':
    case 'computedAge':
      return false;
  }
  return false;
}

function isCondition(value: unknown): value is ApplicabilityCondition {
  if (!isPlainRecord(value) || !hasOnlyDataProperties(value)) return false;
  if (!validId(value.questionId) || typeof value.operator !== 'string')
    return false;
  if (value.operator === 'isAnswered') return Object.keys(value).length === 2;
  if (
    value.operator !== 'equals' &&
    value.operator !== 'notEquals' &&
    value.operator !== 'contains'
  ) {
    return false;
  }
  const validValue =
    (typeof value.value === 'string' &&
      utf8ByteLength(value.value) <= APPROVED_FORM_BOUNDS.maxTextBytes) ||
    (typeof value.value === 'number' && Number.isFinite(value.value)) ||
    typeof value.value === 'boolean';
  return Object.keys(value).length === 3 && validValue;
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

export function validateFormDefinition(input: unknown): FormValidationIssue[] {
  const issues: FormValidationIssue[] = [];
  if (!Array.isArray(input)) return [{ code: 'invalid_question_list' }];
  if (input.length === 0) return [{ code: 'no_questions' }];
  if (input.length > APPROVED_FORM_BOUNDS.maxQuestionsPerForm) {
    issues.push({ code: 'too_many_questions' });
    return issues;
  }

  const questions: FormQuestion[] = [];
  const seen = new Set<string>();
  let conditionCount = 0;

  input.forEach((candidate: unknown) => {
    if (!isPlainRecord(candidate) || !hasOnlyDataProperties(candidate)) {
      issues.push({ code: 'invalid_question' });
      return;
    }

    const questionId = validId(candidate.id) ? candidate.id : undefined;
    if (!allowedKeys(candidate, QUESTION_KEYS)) {
      issues.push({ code: 'unknown_question_field', questionId });
    }
    if (questionId === undefined) {
      issues.push({ code: 'invalid_question_id' });
    } else if (seen.has(questionId)) {
      issues.push({ code: 'duplicate_question_id', questionId });
    } else {
      seen.add(questionId);
    }

    if (!validId(candidate.sectionId)) {
      issues.push({ code: 'invalid_section_id', questionId });
    }
    if (
      typeof candidate.type !== 'string' ||
      !ANSWER_TYPES.has(candidate.type as FormAnswerType)
    ) {
      issues.push({ code: 'unknown_question_type', questionId });
    }
    if (typeof candidate.required !== 'boolean') {
      issues.push({ code: 'invalid_required_flag', questionId });
    }
    if (candidate.charLimit !== undefined) {
      const maximum =
        typeof candidate.type === 'string' &&
        ANSWER_TYPES.has(candidate.type as FormAnswerType)
          ? textTypeLimit(candidate.type as FormAnswerType)
          : undefined;
      if (
        maximum === undefined ||
        !Number.isSafeInteger(candidate.charLimit) ||
        Number(candidate.charLimit) < 1 ||
        Number(candidate.charLimit) > maximum
      ) {
        issues.push({ code: 'invalid_char_limit', questionId });
      }
    }

    let choices: readonly string[] | undefined;
    if (candidate.choices !== undefined) {
      if (
        !Array.isArray(candidate.choices) ||
        candidate.choices.length === 0 ||
        candidate.choices.length > APPROVED_FORM_BOUNDS.maxChoices ||
        candidate.choices.some((choice) =>
          typeof choice !== 'string'
            ? true
            : choice.length === 0 ||
              utf8ByteLength(choice) > APPROVED_FORM_BOUNDS.maxTextBytes,
        ) ||
        new Set(candidate.choices).size !== candidate.choices.length
      ) {
        issues.push({ code: 'invalid_choices', questionId });
      } else {
        choices = candidate.choices as string[];
      }
    }

    let optionLabels: readonly { en: string; ar: string }[] | undefined;
    if (candidate.optionLabels !== undefined) {
      if (
        !Array.isArray(candidate.optionLabels) ||
        candidate.optionLabels.length > APPROVED_FORM_BOUNDS.maxChoices ||
        candidate.optionLabels.some((label) => !isLocalizedText(label)) ||
        (choices !== undefined &&
          candidate.optionLabels.length !== choices.length)
      ) {
        issues.push({ code: 'invalid_option_labels', questionId });
      } else {
        optionLabels = candidate.optionLabels as { en: string; ar: string }[];
      }
    }

    let validation: FormQuestion['validation'];
    if (candidate.validation !== undefined) {
      if (
        !isPlainRecord(candidate.validation) ||
        !hasOnlyDataProperties(candidate.validation) ||
        !allowedKeys(candidate.validation, VALIDATION_KEYS)
      ) {
        issues.push({ code: 'invalid_validation', questionId });
      } else {
        const { minLength, maxLength, min, max, step } = candidate.validation;
        const validLengths =
          (minLength === undefined ||
            (Number.isSafeInteger(minLength) && Number(minLength) >= 0)) &&
          (maxLength === undefined ||
            (Number.isSafeInteger(maxLength) && Number(maxLength) >= 0)) &&
          (minLength === undefined ||
            maxLength === undefined ||
            Number(minLength) <= Number(maxLength));
        const validNumbers =
          (min === undefined ||
            (typeof min === 'number' && Number.isFinite(min))) &&
          (max === undefined ||
            (typeof max === 'number' && Number.isFinite(max))) &&
          (step === undefined ||
            (typeof step === 'number' && Number.isFinite(step) && step > 0)) &&
          (min === undefined ||
            max === undefined ||
            Number(min) <= Number(max));
        if (!validLengths || !validNumbers) {
          issues.push({ code: 'invalid_validation', questionId });
        } else {
          validation = candidate.validation as FormQuestion['validation'];
        }
      }
    }

    let when: ApplicabilityRule | undefined;
    if (candidate.when !== undefined) {
      if (
        !isPlainRecord(candidate.when) ||
        !hasOnlyDataProperties(candidate.when) ||
        !allowedKeys(candidate.when, new Set(['mode', 'conditions'])) ||
        (candidate.when.mode !== 'all' && candidate.when.mode !== 'any') ||
        !Array.isArray(candidate.when.conditions) ||
        candidate.when.conditions.length === 0 ||
        candidate.when.conditions.length >
          APPROVED_FORM_BOUNDS.maxConditionsPerQuestion ||
        !candidate.when.conditions.every(isCondition)
      ) {
        issues.push({ code: 'invalid_applicability', questionId });
      } else {
        conditionCount += candidate.when.conditions.length;
        when = candidate.when as ApplicabilityRule;
      }
    }

    if (
      questionId !== undefined &&
      typeof candidate.sectionId === 'string' &&
      typeof candidate.type === 'string' &&
      ANSWER_TYPES.has(candidate.type as FormAnswerType) &&
      typeof candidate.required === 'boolean'
    ) {
      const question: FormQuestion = {
        id: questionId,
        sectionId: candidate.sectionId,
        type: candidate.type as FormAnswerType,
        required: candidate.required,
        ...(Number.isSafeInteger(candidate.charLimit)
          ? { charLimit: candidate.charLimit as number }
          : {}),
        ...(choices === undefined ? {} : { choices }),
        ...(optionLabels === undefined ? {} : { optionLabels }),
        ...(validation === undefined ? {} : { validation }),
        ...(when === undefined ? {} : { when }),
        ...(isSliderLabels(candidate.labels)
          ? { labels: candidate.labels as FormQuestion['labels'] }
          : {}),
        ...(isFeedbackBands(candidate.feedbackBands)
          ? {
              feedbackBands:
                candidate.feedbackBands as FormQuestion['feedbackBands'],
            }
          : {}),
        ...(Array.isArray(candidate.assetReferences) &&
        candidate.assetReferences.every((asset) => typeof asset === 'string')
          ? { assetReferences: candidate.assetReferences as readonly string[] }
          : {}),
        ...(isLocalizedText(candidate.unit)
          ? { unit: candidate.unit as FormQuestion['unit'] }
          : {}),
        ...(candidate.privacy === 'personal' || candidate.privacy === 'health'
          ? { privacy: candidate.privacy }
          : {}),
        ...(candidate.purpose === 'n12-series'
          ? { purpose: candidate.purpose }
          : {}),
        ...(isLocalizedText(candidate.displayText)
          ? {
              displayText: candidate.displayText as FormQuestion['displayText'],
            }
          : {}),
        ...(typeof candidate.profileField === 'string'
          ? {
              profileField:
                candidate.profileField as FormQuestion['profileField'],
            }
          : {}),
        ...(typeof candidate.dateOfBirthField === 'string'
          ? {
              dateOfBirthField:
                candidate.dateOfBirthField as FormQuestion['dateOfBirthField'],
            }
          : {}),
        ...(candidate.derivedOptions &&
        typeof candidate.derivedOptions === 'object'
          ? {
              derivedOptions:
                candidate.derivedOptions as FormQuestion['derivedOptions'],
            }
          : {}),
      };
      if (
        (question.type === 'singleChoice' ||
          question.type === 'multiChoice' ||
          question.type === 'imageChoice' ||
          question.type === 'mealCount' ||
          question.type === 'derivedChoice') !==
        (question.choices !== undefined)
      ) {
        issues.push({ code: 'choices_required_for_type', questionId });
      }
      if (question.type === 'displayOnly') {
        if (question.required || !isLocalizedText(question.displayText)) {
          issues.push({ code: 'invalid_display_only_question', questionId });
        }
      }
      if (
        question.type === 'profileText' &&
        (question.required || question.profileField !== 'fullName')
      ) {
        issues.push({ code: 'invalid_profile_bound_question', questionId });
      }
      if (
        question.type === 'computedAge' &&
        (question.required || question.dateOfBirthField !== 'dateOfBirth')
      ) {
        issues.push({ code: 'invalid_computed_question', questionId });
      }
      if (
        candidate.privacy !== undefined &&
        candidate.privacy !== 'personal' &&
        candidate.privacy !== 'health'
      ) {
        issues.push({ code: 'invalid_privacy_classification', questionId });
      }
      if (
        candidate.purpose !== undefined &&
        candidate.purpose !== 'n12-series'
      ) {
        issues.push({ code: 'invalid_question_purpose', questionId });
      }
      if (
        question.purpose === 'n12-series' &&
        ((question.id !== 'sex' && question.id !== 'B06') ||
          question.type !== 'singleChoice' ||
          question.required !== true ||
          question.privacy !== 'personal' ||
          question.choices?.length !== 2 ||
          !question.choices.includes('male') ||
          !question.choices.includes('female'))
      ) {
        issues.push({ code: 'invalid_n12_series_selector', questionId });
      }
      if (question.type === 'slider' && !isValidSliderConfiguration(question)) {
        issues.push({ code: 'invalid_slider_configuration', questionId });
      }
      if (
        question.type === 'imageChoice' &&
        (question.assetReferences === undefined ||
          question.assetReferences.length !== question.choices?.length ||
          question.assetReferences.some(
            (asset) =>
              !asset.startsWith('/images/body-fat/') || asset.includes('..'),
          ))
      ) {
        issues.push({ code: 'invalid_image_choice_assets', questionId });
      }
      if (
        question.type === 'mealCount' &&
        (question.id !== 'N07.meal_count' ||
          JSON.stringify(question.choices) !==
            JSON.stringify(['2', '3', '4', '5']))
      ) {
        issues.push({ code: 'invalid_meal_count_range', questionId });
      }
      if (
        question.type === 'derivedChoice' &&
        (question.id !== 'N07.training_timing' ||
          question.derivedOptions?.sourceQuestionId !== 'N07.meal_count' ||
          !Array.isArray(question.derivedOptions?.fixedChoices) ||
          question.derivedOptions?.fixedChoices.length !== 2)
      ) {
        issues.push({ code: 'invalid_derived_options', questionId });
      }
      if (
        question.type !== 'shortText' &&
        question.type !== 'longText' &&
        (question.validation?.minLength !== undefined ||
          question.validation?.maxLength !== undefined)
      ) {
        issues.push({ code: 'text_validation_on_non_text_type', questionId });
      }
      if (
        question.type !== 'number' &&
        question.type !== 'slider' &&
        (question.validation?.min !== undefined ||
          question.validation?.max !== undefined)
      ) {
        issues.push({
          code: 'numeric_validation_on_non_number_type',
          questionId,
        });
      }
      questions.push(question);
    }
  });

  if (conditionCount > APPROVED_FORM_BOUNDS.maxConditions) {
    issues.push({ code: 'too_many_conditions' });
  }
  const sectionCounts = new Map<string, number>();
  for (const question of questions) {
    const count = (sectionCounts.get(question.sectionId) ?? 0) + 1;
    sectionCounts.set(question.sectionId, count);
    if (count === APPROVED_FORM_BOUNDS.maxQuestionsPerSection + 1) {
      issues.push({ code: 'too_many_questions_in_section' });
    }
  }
  if (input.length + conditionCount > APPROVED_FORM_BOUNDS.maxEvaluationSteps) {
    issues.push({ code: 'evaluation_work_too_large' });
  }

  const byId = new Map(questions.map((question) => [question.id, question]));
  const graph = new Map<string, string[]>();
  for (const question of questions) {
    const dependencies: string[] = [];
    for (const condition of question.when?.conditions ?? []) {
      const source = byId.get(condition.questionId);
      if (source === undefined) {
        issues.push({ code: 'unknown_question_id', questionId: question.id });
        continue;
      }
      if (!compatibleCondition(source, condition)) {
        issues.push({
          code: 'incompatible_condition',
          questionId: question.id,
        });
      }
      dependencies.push(source.id);
    }
    graph.set(question.id, dependencies);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(questionId: string): void {
    if (visiting.has(questionId)) {
      issues.push({ code: 'cyclic_applicability' });
      return;
    }
    if (visited.has(questionId)) return;
    visiting.add(questionId);
    for (const dependencyId of graph.get(questionId) ?? []) visit(dependencyId);
    visiting.delete(questionId);
    visited.add(questionId);
  }
  for (const question of questions) visit(question.id);

  if (issues.length === 0) {
    const definitionBytes = new TextEncoder().encode(
      JSON.stringify(input),
    ).length;
    if (definitionBytes > APPROVED_FORM_BOUNDS.maxDefinitionBytes) {
      issues.push({ code: 'definition_too_large' });
    }
  }

  return issues;
}

function isPlainAnswerRecord(value: unknown): value is Record<string, unknown> {
  return isPlainRecord(value) && hasOnlyDataProperties(value);
}

function isAnswerType(type: FormAnswerType, value: unknown): boolean {
  switch (type) {
    case 'shortText':
    case 'longText':
    case 'singleChoice':
    case 'imageChoice':
    case 'mealCount':
    case 'derivedChoice':
    case 'date':
      return typeof value === 'string';
    case 'number':
    case 'slider':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'multiChoice':
      return (
        Array.isArray(value) && value.every((item) => typeof item === 'string')
      );
    case 'displayOnly':
    case 'profileText':
    case 'computedAge':
      return false;
  }
  return false;
}

function isEmptyAnswer(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length === 0;
  return Array.isArray(value) && value.length === 0;
}

export function validateAnswerSet(
  questions: readonly FormQuestion[],
  answers: unknown,
): FormValidationIssue[] {
  const issues = validateFormDefinition(questions);
  if (issues.length > 0) return issues;
  if (!isPlainAnswerRecord(answers)) return [{ code: 'invalid_answer_set' }];

  const answerEntries = Object.entries(answers);
  if (answerEntries.length > questions.length) {
    return [{ code: 'too_many_answers' }];
  }
  const byId = new Map(questions.map((question) => [question.id, question]));
  for (const [questionId, value] of answerEntries) {
    const question = byId.get(questionId);
    if (question === undefined) {
      issues.push({ code: 'unknown_answer_id', questionId });
      continue;
    }
    if (
      NON_ANSWER_TYPES.has(question.type) ||
      !isAnswerType(question.type, value)
    ) {
      issues.push({ code: 'invalid_answer_type', questionId });
      continue;
    }
    if (typeof value === 'string') {
      const typeLimit = textTypeLimit(question.type);
      const maxLength =
        typeLimit === undefined
          ? Number.POSITIVE_INFINITY
          : Math.min(
              question.charLimit ?? typeLimit,
              question.validation?.maxLength ?? typeLimit,
            );
      const minLength =
        typeLimit === undefined ? 0 : (question.validation?.minLength ?? 0);
      const { used: characters, over } = countTextAnswer(value, maxLength);
      if (
        measureTextAnswerBytes(value) > APPROVED_FORM_BOUNDS.maxTextBytes ||
        (typeLimit !== undefined && over)
      ) {
        issues.push({ code: 'answer_too_long', questionId });
      }
      if (characters < minLength)
        issues.push({ code: 'answer_too_short', questionId });
      if (
        (question.type === 'singleChoice' ||
          question.type === 'mealCount' ||
          question.type === 'derivedChoice') &&
        !question.choices?.includes(value)
      ) {
        issues.push({ code: 'invalid_choice', questionId });
      }
      if (
        question.type === 'imageChoice' &&
        !question.choices?.includes(value)
      ) {
        issues.push({ code: 'invalid_choice', questionId });
      }
      if (question.type === 'derivedChoice') {
        const parentId = question.derivedOptions?.sourceQuestionId;
        const parentValue = parentId ? answers[parentId] : undefined;
        const mealCount =
          typeof parentValue === 'string' ? Number(parentValue) : Number.NaN;
        const derivedChoices =
          Number.isInteger(mealCount) && mealCount >= 2 && mealCount <= 5
            ? [
                ...Array.from(
                  { length: mealCount },
                  (_, index) => `meal-${index + 1}`,
                ),
                ...(question.derivedOptions?.fixedChoices ?? []),
              ]
            : [];
        if (!derivedChoices.includes(value)) {
          issues.push({ code: 'invalid_choice', questionId });
        }
      }
      if (
        question.type === 'date' &&
        !isEmptyAnswer(value) &&
        !isValidCalendarDate(value)
      ) {
        issues.push({ code: 'invalid_date', questionId });
      }
    } else if (typeof value === 'number') {
      if (
        (question.validation?.min !== undefined &&
          value < question.validation.min) ||
        (question.validation?.max !== undefined &&
          value > question.validation.max)
      ) {
        issues.push({ code: 'number_out_of_range', questionId });
      }
      if (
        question.type === 'slider' &&
        question.validation?.step !== undefined &&
        question.validation.min !== undefined &&
        Math.abs(
          (value - question.validation.min) / question.validation.step -
            Math.round(
              (value - question.validation.min) / question.validation.step,
            ),
        ) > 1e-9
      ) {
        issues.push({ code: 'number_out_of_range', questionId });
      }
    } else if (Array.isArray(value)) {
      const unique = new Set(value);
      if (
        value.length > APPROVED_FORM_BOUNDS.maxChoices ||
        unique.size !== value.length ||
        value.some((choice) => !question.choices?.includes(choice))
      ) {
        issues.push({ code: 'invalid_choice', questionId });
      }
    }
  }

  if (
    measureAnswerPayloadBytes(answers) > APPROVED_FORM_BOUNDS.maxPayloadBytes
  ) {
    issues.push({ code: 'payload_too_large' });
  }
  return issues;
}

export function isAnswered(value: FormAnswer | undefined): boolean {
  return value !== undefined && !isEmptyAnswer(value);
}

/** Calculate an age against the current civil date in Africa/Cairo. */
export function calculateAgeInCairo(
  dateOfBirth: string,
  now: Date,
): number | null {
  if (!isValidCalendarDate(dateOfBirth) || Number.isNaN(now.getTime())) {
    return null;
  }
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const current = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  const year = Number(current.year);
  const month = Number(current.month);
  const day = Number(current.day);
  const [birthYear, birthMonth, birthDay] = dateOfBirth
    .split('-')
    .map(Number) as [number, number, number];
  if (birthYear > year) return null;
  return (
    year -
    birthYear -
    (month < birthMonth || (month === birthMonth && day < birthDay) ? 1 : 0)
  );
}

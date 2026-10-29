export const APPROVED_FORM_BOUNDS = {
  maxQuestionsPerSection: 20,
  maxQuestionsPerForm: 60,
  maxConditions: 400,
  maxConditionsPerQuestion: 16,
  maxEvaluationSteps: 4_000,
  maxDefinitionBytes: 131_072,
  // pending PO: must accommodate all valid forms
  maxPayloadBytes: 16_384,
  maxTextBytes: 4_096,
  maxChoices: 50,
} as const;

const UTF8_ENCODER = new TextEncoder();

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).length;
}

export type FormAnswerType =
  | 'shortText'
  | 'longText'
  | 'number'
  | 'singleChoice'
  | 'multiChoice'
  | 'boolean'
  | 'date';

export type FormAnswer = string | number | boolean | readonly string[];
export type FormAnswerSet = Readonly<Record<string, FormAnswer>>;
export type ConditionValue = string | number | boolean;

export type ApplicabilityCondition =
  | {
      questionId: string;
      operator: 'equals' | 'notEquals';
      value: ConditionValue;
    }
  | { questionId: string; operator: 'contains'; value: string }
  | { questionId: string; operator: 'isAnswered' };

export type ApplicabilityRule = {
  mode: 'all' | 'any';
  conditions: readonly ApplicabilityCondition[];
};

export type FormQuestion = {
  id: string;
  sectionId: string;
  type: FormAnswerType;
  required: boolean;
  choices?: readonly string[];
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  };
  when?: ApplicabilityRule;
};

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
]);

const QUESTION_KEYS = new Set([
  'id',
  'sectionId',
  'type',
  'required',
  'choices',
  'validation',
  'when',
]);
const VALIDATION_KEYS = new Set(['minLength', 'maxLength', 'min', 'max']);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
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
    case 'date':
      return typeof condition.value === 'string';
    case 'number':
      return (
        typeof condition.value === 'number' && Number.isFinite(condition.value)
      );
    case 'boolean':
      return typeof condition.value === 'boolean';
    case 'multiChoice':
      return false;
  }
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

    let validation: FormQuestion['validation'];
    if (candidate.validation !== undefined) {
      if (
        !isPlainRecord(candidate.validation) ||
        !hasOnlyDataProperties(candidate.validation) ||
        !allowedKeys(candidate.validation, VALIDATION_KEYS)
      ) {
        issues.push({ code: 'invalid_validation', questionId });
      } else {
        const { minLength, maxLength, min, max } = candidate.validation;
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
        ...(choices === undefined ? {} : { choices }),
        ...(validation === undefined ? {} : { validation }),
        ...(when === undefined ? {} : { when }),
      };
      if (
        (question.type === 'singleChoice' ||
          question.type === 'multiChoice') !==
        (question.choices !== undefined)
      ) {
        issues.push({ code: 'choices_required_for_type', questionId });
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

function answerPayloadBytes(answers: Record<string, unknown>): number {
  const encoder = new TextEncoder();
  let bytes = 2;
  for (const [index, [questionId, answer]] of Object.entries(
    answers,
  ).entries()) {
    if (index > 0) bytes += 1;
    bytes += encoder.encode(JSON.stringify(questionId)).length + 1;
    if (Array.isArray(answer)) {
      if (answer.length > APPROVED_FORM_BOUNDS.maxChoices) {
        return APPROVED_FORM_BOUNDS.maxPayloadBytes + 1;
      }
      bytes += 2;
      answer.forEach((item, itemIndex) => {
        if (itemIndex > 0) bytes += 1;
        bytes +=
          typeof item === 'string'
            ? encoder.encode(JSON.stringify(item)).length
            : APPROVED_FORM_BOUNDS.maxPayloadBytes + 1;
      });
    } else if (typeof answer === 'string') {
      if (utf8ByteLength(answer) > APPROVED_FORM_BOUNDS.maxTextBytes) {
        return APPROVED_FORM_BOUNDS.maxPayloadBytes + 1;
      }
      bytes += encoder.encode(JSON.stringify(answer)).length;
    } else if (typeof answer === 'number' || typeof answer === 'boolean') {
      bytes += String(answer).length;
    } else {
      bytes += APPROVED_FORM_BOUNDS.maxPayloadBytes + 1;
    }
  }
  return bytes;
}

function isAnswerType(type: FormAnswerType, value: unknown): boolean {
  switch (type) {
    case 'shortText':
    case 'longText':
    case 'singleChoice':
    case 'date':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'multiChoice':
      return (
        Array.isArray(value) && value.every((item) => typeof item === 'string')
      );
  }
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
    if (!isAnswerType(question.type, value)) {
      issues.push({ code: 'invalid_answer_type', questionId });
      continue;
    }
    if (typeof value === 'string') {
      const maxLength =
        question.validation?.maxLength ?? APPROVED_FORM_BOUNDS.maxTextBytes;
      const minLength = question.validation?.minLength ?? 0;
      const bytes = utf8ByteLength(value);
      const characters = Array.from(value).length;
      if (bytes > APPROVED_FORM_BOUNDS.maxTextBytes || characters > maxLength) {
        issues.push({ code: 'answer_too_long', questionId });
      }
      if (characters < minLength)
        issues.push({ code: 'answer_too_short', questionId });
      if (
        question.type === 'singleChoice' &&
        !question.choices?.includes(value)
      ) {
        issues.push({ code: 'invalid_choice', questionId });
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

  if (answerPayloadBytes(answers) > APPROVED_FORM_BOUNDS.maxPayloadBytes) {
    issues.push({ code: 'payload_too_large' });
  }
  return issues;
}

export function isAnswered(value: FormAnswer | undefined): boolean {
  return value !== undefined && !isEmptyAnswer(value);
}

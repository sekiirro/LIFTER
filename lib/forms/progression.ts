import {
  isAnswered,
  validateAnswerSet,
  validateFormDefinition,
  type ApplicabilityCondition,
  type FormAnswerSet,
  type FormQuestion,
  type FormValidationIssue,
} from './validation';

export type ProgressionQuestion = FormQuestion;

export type ProgressionInput = {
  questions: readonly ProgressionQuestion[];
  answers: FormAnswerSet;
  currentQuestionId?: string;
};

export type ProgressionResult = {
  answers: FormAnswerSet;
  errors: readonly FormValidationIssue[];
  applicableQuestionIds: readonly string[];
  /** Navigable questions; N08.foods is rendered inline with its parent. */
  stepQuestionIds: readonly string[];
  currentQuestion: ProgressionQuestion | null;
  previousQuestionId: string | null;
  nextQuestionId: string | null;
  missingRequiredQuestionIds: readonly string[];
  complete: boolean;
};

const N7_FIXED_TIMING_OPTIONS = ['before-first', 'no-fixed-time'] as const;

/** N7 uses the PO-approved 2–5 meal selection and derives the meal choices. */
export function deriveMealTimingOptions(
  selectedMealCount: number | string,
): string[] {
  const mealCount =
    typeof selectedMealCount === 'number'
      ? selectedMealCount
      : /^[2-5]$/.test(selectedMealCount)
        ? Number(selectedMealCount)
        : Number.NaN;
  if (!Number.isInteger(mealCount) || mealCount < 2 || mealCount > 5) {
    return [];
  }
  return [
    ...Array.from({ length: mealCount }, (_, index) => `meal-${index + 1}`),
    ...N7_FIXED_TIMING_OPTIONS,
  ];
}

/** Drop a saved derived value when its parent selection no longer allows it. */
export function reconcileDerivedChoice(
  selected: string | undefined,
  allowed: readonly string[],
): string | undefined {
  return selected !== undefined && allowed.includes(selected)
    ? selected
    : undefined;
}

/** Sensitive sex data is used only to select the approved N12 image series. */
export function resolveN12ImageSeries(
  sex: string | undefined,
): 'male' | 'female' | null {
  if (sex === 'male') return 'male';
  if (sex === 'female') return 'female';
  return null;
}

function conditionMatches(
  condition: ApplicabilityCondition,
  answers: FormAnswerSet,
): boolean {
  const answer = answers[condition.questionId];
  if (condition.operator === 'isAnswered') return isAnswered(answer);
  if (!isAnswered(answer)) return false;
  if (condition.operator === 'contains') {
    return Array.isArray(answer) && answer.includes(condition.value);
  }
  if (condition.operator === 'equals')
    return Object.is(answer, condition.value);
  return !Object.is(answer, condition.value);
}

function questionApplies(
  question: ProgressionQuestion,
  answers: FormAnswerSet,
  applicable: ReadonlySet<string>,
): boolean {
  const rule = question.when;
  if (rule === undefined) return true;
  const results = rule.conditions.map((condition) =>
    applicable.has(condition.questionId)
      ? conditionMatches(condition, answers)
      : false,
  );
  return rule.mode === 'all' ? results.every(Boolean) : results.some(Boolean);
}

function failure(
  answers: FormAnswerSet,
  errors: readonly FormValidationIssue[],
): ProgressionResult {
  return {
    answers,
    errors,
    applicableQuestionIds: [],
    stepQuestionIds: [],
    currentQuestion: null,
    previousQuestionId: null,
    nextQuestionId: null,
    missingRequiredQuestionIds: [],
    complete: false,
  };
}

export function evaluateProgression(
  input: ProgressionInput,
): ProgressionResult {
  const definitionIssues = validateFormDefinition(input.questions);
  if (definitionIssues.length > 0)
    return failure(input.answers, definitionIssues);

  const answerIssues = validateAnswerSet(input.questions, input.answers);
  if (answerIssues.length > 0) return failure(input.answers, answerIssues);

  const questionIds = new Set(input.questions.map(({ id }) => id));
  if (
    input.currentQuestionId !== undefined &&
    !questionIds.has(input.currentQuestionId)
  ) {
    return failure(input.answers, [
      {
        code: 'unknown_current_question_id',
        questionId: input.currentQuestionId,
      },
    ]);
  }

  const applicable = new Set<string>();
  const byId = new Map(
    input.questions.map((question) => [question.id, question]),
  );
  const dependencyOrder: ProgressionQuestion[] = [];
  const visited = new Set<string>();
  function visit(question: ProgressionQuestion): void {
    if (visited.has(question.id)) return;
    visited.add(question.id);
    for (const condition of question.when?.conditions ?? []) {
      const dependency = byId.get(condition.questionId);
      if (dependency !== undefined) visit(dependency);
    }
    dependencyOrder.push(question);
  }
  for (const question of input.questions) visit(question);

  for (const question of dependencyOrder) {
    if (questionApplies(question, input.answers, applicable)) {
      applicable.add(question.id);
    }
  }

  const activeInOrder = input.questions.filter(({ id }) => applicable.has(id));
  const activeIds = activeInOrder.map(({ id }) => id);
  const stepQuestions = activeInOrder.filter(({ id }) => id !== 'N08.foods');
  const stepIds = stepQuestions.map(({ id }) => id);
  const missingRequiredQuestionIds = activeInOrder
    .filter(
      (question) =>
        question.required && !isAnswered(input.answers[question.id]),
    )
    .map(({ id }) => id);

  const requestedIndex =
    input.currentQuestionId === undefined
      ? -1
      : stepIds.indexOf(input.currentQuestionId);
  const firstMissingId = missingRequiredQuestionIds[0];
  const firstMissingStepId =
    firstMissingId === 'N08.foods' ? 'N08' : firstMissingId;
  const currentId =
    requestedIndex >= 0
      ? input.currentQuestionId!
      : (firstMissingStepId ?? stepIds[0] ?? null);
  const currentIndex = currentId === null ? -1 : stepIds.indexOf(currentId);
  const currentQuestion =
    currentIndex < 0 ? null : (stepQuestions[currentIndex] ?? null);

  return {
    answers: input.answers,
    errors: [],
    applicableQuestionIds: activeIds,
    stepQuestionIds: stepIds,
    currentQuestion,
    previousQuestionId:
      currentIndex > 0 ? (stepIds[currentIndex - 1] ?? null) : null,
    nextQuestionId:
      currentIndex >= 0 && currentIndex < stepIds.length - 1
        ? (stepIds[currentIndex + 1] ?? null)
        : null,
    missingRequiredQuestionIds,
    complete: missingRequiredQuestionIds.length === 0,
  };
}

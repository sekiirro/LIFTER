import { evaluateProgression } from './progression';
import {
  APPROVED_FORM_BOUNDS,
  countTextAnswer,
  measureTextAnswerBytes,
  type FormAnswerSet,
  type FormAnswer,
  type FormQuestion,
} from './validation';

export function setClientAnswer(
  answers: FormAnswerSet,
  questionId: string,
  value: FormAnswer | undefined,
): FormAnswerSet {
  const next = { ...answers };
  if (value === undefined) delete next[questionId];
  else next[questionId] = value;
  return next;
}

/** Keep only food chips that belong to the currently selected N08 budget. */
export function answersForBudgetSelection(
  answers: FormAnswerSet,
  budget: string,
): FormAnswerSet {
  const selectedFoods = answers['N08.foods'];
  if (!Array.isArray(selectedFoods)) return answers;
  const prefix = `${budget}:`;
  const stillValid = selectedFoods.filter((food) => food.startsWith(prefix));
  const next = { ...answers };
  if (stillValid.length > 0) next['N08.foods'] = stillValid;
  else delete next['N08.foods'];
  return next;
}

export function answersForClientProgression<T extends FormQuestion>(
  questions: readonly T[],
  answers: FormAnswerSet,
): FormAnswerSet {
  const safe = { ...answers };
  for (const question of questions) {
    const answer = safe[question.id];
    if (typeof answer !== 'string') continue;
    const cap =
      question.type === 'shortText'
        ? Math.min(question.charLimit ?? 150, 150)
        : question.type === 'longText'
          ? Math.min(question.charLimit ?? 1_000, 1_000)
          : Number.POSITIVE_INFINITY;
    if (
      countTextAnswer(answer, cap).over ||
      measureTextAnswerBytes(answer) > APPROVED_FORM_BOUNDS.maxTextBytes
    ) {
      delete safe[question.id];
    }
  }
  return safe;
}

/** Keeps the client's in-memory and mocked-persistence answer set branch-current. */
export function applicableClientAnswers<T extends FormQuestion>(
  questions: readonly T[],
  answers: FormAnswerSet,
): FormAnswerSet {
  const runtimeQuestions = questions.map(
    (question) =>
      Object.fromEntries(
        Object.entries(question).filter(
          ([key]) =>
            key !== 'title' && key !== 'description' && key !== 'label',
        ),
      ) as unknown as FormQuestion,
  );
  const progression = evaluateProgression({
    questions: runtimeQuestions,
    answers: answersForClientProgression(runtimeQuestions, answers),
  });
  if (progression.errors.length > 0) return answers;
  const applicable = new Set(progression.applicableQuestionIds);
  return Object.fromEntries(
    Object.entries(answers).filter(([questionId]) =>
      applicable.has(questionId),
    ),
  );
}

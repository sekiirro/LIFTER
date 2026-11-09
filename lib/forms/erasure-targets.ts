import { evaluateProgression } from './progression';
import type { FormAnswerSet, FormQuestion } from './validation';

export type ErasureFormDefinition = {
  workspaceId: string;
  questions: readonly FormQuestion[];
};

export type ErasureAnswerVersion = {
  id: string;
  questionId: string;
  workspaceId: string;
  assignmentId: string;
};

export type ErasureBranchChange = {
  status: 'server-validated';
  workspaceId: string;
  assignmentId: string;
  previousAnswers: FormAnswerSet;
  currentAnswers: FormAnswerSet;
};

export type ErasureAuditCategory =
  | 'answer_change'
  | 'access_view'
  | 'financial'
  | 'authentication'
  | 'authorization'
  | 'security'
  | 'unrelated_client'
  | 'other';

export type ErasureAuditRow = {
  id: string;
  answerId: string | null;
  category: ErasureAuditCategory;
  workspaceId: string;
  assignmentId: string;
};

export type ErasureControlRecord = {
  answerCount: number;
  answerChangeAuditCount: number;
  accessViewAuditCount: number;
};

export type ErasureTargetSelection = {
  answerIds: readonly string[];
  auditRowIds: readonly string[];
  controlRecord: ErasureControlRecord;
  defer: boolean;
  alert: boolean;
};

export type SelectFormErasureTargetsInput = {
  formDefinition: ErasureFormDefinition;
  answerVersions: readonly ErasureAnswerVersion[];
  branchChange: ErasureBranchChange;
  auditRows: readonly ErasureAuditRow[];
  legalHold: boolean;
};

const emptyControlRecord = (): ErasureControlRecord => ({
  answerCount: 0,
  answerChangeAuditCount: 0,
  accessViewAuditCount: 0,
});

function emptySelection(deferred = false): ErasureTargetSelection {
  return {
    answerIds: [],
    auditRowIds: [],
    controlRecord: emptyControlRecord(),
    defer: deferred,
    alert: deferred,
  };
}

export function selectFormErasureTargets(
  input: SelectFormErasureTargetsInput,
): ErasureTargetSelection {
  const { formDefinition, answerVersions, branchChange, auditRows, legalHold } =
    input;

  if (legalHold) return emptySelection(true);
  if (
    branchChange.status !== 'server-validated' ||
    branchChange.workspaceId !== formDefinition.workspaceId ||
    branchChange.assignmentId.length === 0
  ) {
    return emptySelection();
  }

  const progressionQuestions = formDefinition.questions.map((question) => {
    const sanitized = { ...question } as FormQuestion & { label?: unknown };
    delete sanitized.label;
    return sanitized;
  });
  const previousState = evaluateProgression({
    questions: progressionQuestions,
    answers: branchChange.previousAnswers,
  });
  const currentState = evaluateProgression({
    questions: progressionQuestions,
    answers: branchChange.currentAnswers,
  });
  if (previousState.errors.length > 0 || currentState.errors.length > 0)
    return emptySelection();

  const currentlyApplicable = new Set(currentState.applicableQuestionIds);
  const currentlyInapplicable = new Set(
    formDefinition.questions
      .map(({ id }) => id)
      .filter((questionId) => !currentlyApplicable.has(questionId)),
  );
  if (currentlyInapplicable.size === 0) return emptySelection();

  const answerIds = [
    ...new Set(
      answerVersions
        .filter(
          (answer) =>
            answer.workspaceId === formDefinition.workspaceId &&
            answer.assignmentId === branchChange.assignmentId &&
            currentlyInapplicable.has(answer.questionId),
        )
        .map(({ id }) => id),
    ),
  ];
  if (answerIds.length === 0) return emptySelection();

  const targetAnswerIds = new Set(answerIds);
  const eligibleAuditRows = auditRows.filter(
    (row) =>
      row.workspaceId === formDefinition.workspaceId &&
      row.assignmentId === branchChange.assignmentId &&
      row.answerId !== null &&
      targetAnswerIds.has(row.answerId) &&
      (row.category === 'answer_change' || row.category === 'access_view'),
  );
  const answerChangeAuditCount = eligibleAuditRows.filter(
    ({ category }) => category === 'answer_change',
  ).length;
  const accessViewAuditCount = eligibleAuditRows.filter(
    ({ category }) => category === 'access_view',
  ).length;

  return {
    answerIds,
    auditRowIds: eligibleAuditRows.map(({ id }) => id),
    controlRecord: {
      answerCount: answerIds.length,
      answerChangeAuditCount,
      accessViewAuditCount,
    },
    defer: false,
    alert: false,
  };
}

import { describe, expect, it } from 'vitest';

import {
  selectFormErasureTargets,
  type ErasureAuditRow,
  type ErasureAnswerVersion,
  type ErasureFormDefinition,
} from '../../lib/forms/erasure-targets';

const formDefinition: ErasureFormDefinition = {
  workspaceId: 'workspace-a',
  questions: [
    { id: 'has-injury', sectionId: 'basic', type: 'boolean', required: true },
    {
      id: 'injury-detail',
      sectionId: 'basic',
      type: 'shortText',
      required: true,
      when: {
        mode: 'all',
        conditions: [
          { questionId: 'has-injury', operator: 'equals', value: true },
        ],
      },
    },
    {
      id: 'training-goal',
      sectionId: 'workout',
      type: 'shortText',
      required: true,
    },
  ],
};

const branchChange = {
  status: 'server-validated' as const,
  workspaceId: 'workspace-a',
  assignmentId: 'assignment-a',
  previousAnswers: {
    'has-injury': true,
    'injury-detail': 'previous answer',
    'training-goal': 'strength',
  },
  currentAnswers: {
    'has-injury': false,
    'injury-detail': 'previous answer',
    'training-goal': 'strength',
  },
};

const answerVersions: readonly ErasureAnswerVersion[] = [
  {
    id: 'answer-injury-v1',
    questionId: 'injury-detail',
    workspaceId: 'workspace-a',
    assignmentId: 'assignment-a',
  },
  {
    id: 'answer-injury-v2',
    questionId: 'injury-detail',
    workspaceId: 'workspace-a',
    assignmentId: 'assignment-a',
  },
  {
    id: 'answer-goal-v1',
    questionId: 'training-goal',
    workspaceId: 'workspace-a',
    assignmentId: 'assignment-a',
  },
];

const auditRows: readonly ErasureAuditRow[] = [
  {
    id: 'audit-change-v1',
    answerId: 'answer-injury-v1',
    category: 'answer_change',
    workspaceId: 'workspace-a',
    assignmentId: 'assignment-a',
  },
  {
    id: 'audit-view-v2',
    answerId: 'answer-injury-v2',
    category: 'access_view',
    workspaceId: 'workspace-a',
    assignmentId: 'assignment-a',
  },
  {
    id: 'audit-goal-view',
    answerId: 'answer-goal-v1',
    category: 'access_view',
    workspaceId: 'workspace-a',
    assignmentId: 'assignment-a',
  },
];

function select(
  overrides: Partial<{
    formDefinition: ErasureFormDefinition;
    answerVersions: readonly ErasureAnswerVersion[];
    branchChange: typeof branchChange;
    auditRows: readonly ErasureAuditRow[];
    legalHold: boolean;
  }> = {},
) {
  return selectFormErasureTargets({
    formDefinition: overrides.formDefinition ?? formDefinition,
    answerVersions: overrides.answerVersions ?? answerVersions,
    branchChange: overrides.branchChange ?? branchChange,
    auditRows: overrides.auditRows ?? auditRows,
    legalHold: overrides.legalHold ?? false,
  });
}

describe('selectFormErasureTargets', () => {
  it('selects only answer rows made inapplicable and selects them across versions', () => {
    const result = select();

    expect(result.answerIds).toEqual(['answer-injury-v1', 'answer-injury-v2']);
    expect(result.answerIds).not.toContain('answer-goal-v1');
    expect(result.auditRowIds).toEqual(['audit-change-v1', 'audit-view-v2']);
  });

  it('handles presentation labels on snapshot questions during progression', () => {
    const labeledDefinition = {
      ...formDefinition,
      questions: formDefinition.questions.map((question) => ({
        ...question,
        label: { en: `Label ${question.id}`, ar: `وصف ${question.id}` },
      })),
    } as ErasureFormDefinition;

    const result = select({ formDefinition: labeledDefinition });

    expect(result.answerIds).toEqual(['answer-injury-v1', 'answer-injury-v2']);
    expect(result.auditRowIds).toEqual(['audit-change-v1', 'audit-view-v2']);
  });

  it('selects currently inapplicable answers while leaving still-applicable answers untouched', () => {
    const result = select({
      branchChange: {
        ...branchChange,
        previousAnswers: {
          'has-injury': false,
          'injury-detail': 'stale hidden answer',
          'training-goal': 'strength',
        },
      },
    });

    expect(result.answerIds).toEqual(['answer-injury-v1', 'answer-injury-v2']);
    expect(result.answerIds).not.toContain('answer-goal-v1');
    expect(result.auditRowIds).toEqual(['audit-change-v1', 'audit-view-v2']);
  });

  it('selects answer-change and access-view rows for target answer rows only', () => {
    const result = select({
      auditRows: [
        ...auditRows,
        {
          id: 'audit-financial',
          answerId: 'answer-injury-v1',
          category: 'financial',
          workspaceId: 'workspace-a',
          assignmentId: 'assignment-a',
        },
        {
          id: 'audit-authentication',
          answerId: 'answer-injury-v1',
          category: 'authentication',
          workspaceId: 'workspace-a',
          assignmentId: 'assignment-a',
        },
        {
          id: 'audit-authorization',
          answerId: 'answer-injury-v1',
          category: 'authorization',
          workspaceId: 'workspace-a',
          assignmentId: 'assignment-a',
        },
        {
          id: 'audit-security',
          answerId: 'answer-injury-v1',
          category: 'security',
          workspaceId: 'workspace-a',
          assignmentId: 'assignment-a',
        },
        {
          id: 'audit-unrelated-client',
          answerId: 'answer-injury-v1',
          category: 'unrelated_client',
          workspaceId: 'workspace-a',
          assignmentId: 'assignment-a',
        },
        {
          id: 'audit-other-tenant',
          answerId: 'answer-injury-v1',
          category: 'answer_change',
          workspaceId: 'workspace-b',
          assignmentId: 'assignment-a',
        },
        {
          id: 'audit-other-assignment',
          answerId: 'answer-injury-v1',
          category: 'access_view',
          workspaceId: 'workspace-a',
          assignmentId: 'assignment-b',
        },
      ],
    });

    expect(result.auditRowIds).toEqual(['audit-change-v1', 'audit-view-v2']);
  });

  it('returns no targets and signals defer plus alert during legal hold', () => {
    const result = select({ legalHold: true });

    expect(result.answerIds).toEqual([]);
    expect(result.auditRowIds).toEqual([]);
    expect(result.defer).toBe(true);
    expect(result.alert).toBe(true);
  });

  it('selects still-inapplicable answers when a legal hold is released without a new branch change', () => {
    const unchangedBranch = {
      ...branchChange,
      previousAnswers: branchChange.currentAnswers,
    };
    const deferred = select({ branchChange: unchangedBranch, legalHold: true });
    const resumed = select({ branchChange: unchangedBranch, legalHold: false });

    expect(deferred.answerIds).toEqual([]);
    expect(deferred.defer).toBe(true);
    expect(resumed.answerIds).toEqual(['answer-injury-v1', 'answer-injury-v2']);
    expect(resumed.auditRowIds).toEqual(['audit-change-v1', 'audit-view-v2']);
  });

  it('selects a pre-existing inapplicable answer even when the prior and current states match', () => {
    const earlierInapplicableState = {
      ...branchChange,
      previousAnswers: branchChange.currentAnswers,
    };
    const result = select({ branchChange: earlierInapplicableState });

    expect(result.answerIds).toEqual(['answer-injury-v1', 'answer-injury-v2']);
    expect(result.auditRowIds).toEqual(['audit-change-v1', 'audit-view-v2']);
  });

  it('keeps every version of a currently applicable question untouched', () => {
    const currentlyApplicableState = {
      ...branchChange,
      previousAnswers: {
        'has-injury': false,
        'injury-detail': 'answer from when this question was hidden',
        'training-goal': 'strength',
      },
      currentAnswers: {
        'has-injury': true,
        'injury-detail': 'current answer',
        'training-goal': 'strength',
      },
    };
    const result = select({ branchChange: currentlyApplicableState });

    expect(result.answerIds).toEqual([]);
    expect(result.auditRowIds).toEqual([]);
    expect(result.controlRecord).toEqual({
      answerCount: 0,
      answerChangeAuditCount: 0,
      accessViewAuditCount: 0,
    });
  });

  it('returns no targets on an idempotent rerun after target rows are gone', () => {
    const result = select({ answerVersions: [], auditRows: [] });

    expect(result.answerIds).toEqual([]);
    expect(result.auditRowIds).toEqual([]);
    expect(result.controlRecord).toEqual({
      answerCount: 0,
      answerChangeAuditCount: 0,
      accessViewAuditCount: 0,
    });
  });

  it('records counts only without assignment, question, answer, or audit row identifiers', () => {
    const result = select();

    expect(result.controlRecord).toEqual({
      answerCount: 2,
      answerChangeAuditCount: 1,
      accessViewAuditCount: 1,
    });
    expect(
      Object.keys(result.controlRecord).every((key) => /count$/i.test(key)),
    ).toBe(true);
    expect(JSON.stringify(result.controlRecord)).not.toMatch(
      /workspace|assignment|question|answer-injury|audit-change/i,
    );
  });

  it('fails closed when the branch-change fact is not server-validated', () => {
    const result = select({
      branchChange: {
        ...branchChange,
        status: 'untrusted' as 'server-validated',
      },
    });

    expect(result.answerIds).toEqual([]);
    expect(result.auditRowIds).toEqual([]);
  });
});

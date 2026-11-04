import type { FormsClientAdapter } from '../../components/forms/QuestionFlow';
import type { FormAnswerSet } from './validation';

type MockRecord = {
  revision: number;
  answers: FormAnswerSet;
  submitted: boolean;
};

/** In-memory adapter for UI previews and component flows; it performs no I/O. */
export function createMockFormsClientAdapter(
  seed: Record<string, { revision: number; answers: FormAnswerSet }> = {},
): FormsClientAdapter {
  const records = new Map<string, MockRecord>(
    Object.entries(seed).map(([id, value]) => [
      id,
      { ...value, submitted: false },
    ]),
  );
  function read(assignmentId: string) {
    const record = records.get(assignmentId);
    return record
      ? {
          status: 'loaded' as const,
          revision: record.revision,
          answers: { ...record.answers },
        }
      : { status: 'loaded' as const, revision: 1, answers: {} };
  }
  function save(
    assignmentId: string,
    expectedRevision: number,
    answers: FormAnswerSet,
    submitted: boolean,
  ) {
    const current = records.get(assignmentId) ?? {
      revision: expectedRevision,
      answers: {},
      submitted: false,
    };
    if (current.revision !== expectedRevision)
      return { status: 'conflict' as const };
    const revision = current.revision + 1;
    records.set(assignmentId, { revision, answers: { ...answers }, submitted });
    return { status: 'saved' as const, revision };
  }
  return {
    reloadDraft: async ({ assignmentId }) => read(assignmentId),
    saveDraft: async ({ assignmentId, expectedRevision, answers }) =>
      save(assignmentId, expectedRevision, answers, false),
    correct: async ({ assignmentId, expectedRevision, answers }) =>
      save(assignmentId, expectedRevision, answers, true),
    submit: async ({ assignmentId, expectedRevision, answers }) => {
      const result = save(assignmentId, expectedRevision, answers, true);
      return result.status === 'saved'
        ? { status: 'submitted' as const, revision: result.revision }
        : result;
    },
  };
}

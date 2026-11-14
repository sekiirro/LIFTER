import type { FormsClientAdapter } from '../../components/forms/QuestionFlow';
import type { FormAnswerSet } from './validation';

type SafeRouteResult = {
  status?: unknown;
  revision?: unknown;
  answers?: unknown;
  httpStatus?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function post(
  assignmentId: string,
  operation: 'draft' | 'submit' | 'corrections',
  body: Record<string, unknown>,
): Promise<SafeRouteResult | null> {
  try {
    const response = await fetch(
      `/api/forms/assignments/${encodeURIComponent(assignmentId)}/${operation}`,
      {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    const result: unknown = await response.json();
    return isRecord(result)
      ? { ...(result as SafeRouteResult), httpStatus: response.status }
      : { httpStatus: response.status };
  } catch {
    return null;
  }
}

async function readDraft(assignmentId: string) {
  try {
    const response = await fetch(
      `/api/forms/assignments/${encodeURIComponent(assignmentId)}/draft`,
      { method: 'GET', cache: 'no-store', credentials: 'same-origin' },
    );
    const result: unknown = await response.json();
    return response.ok && isRecord(result) ? (result as SafeRouteResult) : null;
  } catch {
    return null;
  }
}

function revision(result: SafeRouteResult | null): number | undefined {
  return typeof result?.revision === 'number' &&
    Number.isSafeInteger(result.revision) &&
    result.revision >= 0
    ? result.revision
    : undefined;
}

function isConflict(status: unknown) {
  return status === 'conflict' || status === 'already_submitted';
}

/** Session-cookie adapter for the real client assignment route. */
export function createAuthorizedFormsClientAdapter(): FormsClientAdapter {
  return {
    reloadDraft: async ({ assignmentId }) => {
      const result = await readDraft(assignmentId);
      const nextRevision = revision(result);
      if (
        result?.status !== 'loaded' ||
        nextRevision === undefined ||
        !isRecord(result.answers)
      )
        return { status: 'error' };
      return {
        status: 'loaded',
        revision: nextRevision,
        answers: result.answers as FormAnswerSet,
      };
    },
    reloadSubmitted: async ({ assignmentId }) => {
      try {
        const response = await fetch(
          `/api/forms/assignments/${encodeURIComponent(assignmentId)}/corrections`,
          { method: 'GET', cache: 'no-store', credentials: 'same-origin' },
        );
        const result: unknown = await response.json();
        if (!response.ok || !isRecord(result)) return { status: 'error' };
        const nextRevision = revision(result);
        if (
          result.status !== 'loaded' ||
          nextRevision === undefined ||
          !isRecord(result.answers)
        )
          return { status: 'error' };
        return {
          status: 'loaded',
          revision: nextRevision,
          answers: result.answers as FormAnswerSet,
        };
      } catch {
        return { status: 'error' };
      }
    },
    saveDraft: async ({
      assignmentId,
      expectedRevision,
      answers,
      intentKey,
    }) => {
      const result = await post(assignmentId, 'draft', {
        expected_revision: expectedRevision,
        intent_key: intentKey ?? crypto.randomUUID(),
        answer_values: answers,
      });
      if (result?.status === 'saved')
        return { status: 'saved', revision: revision(result) };
      if (isConflict(result?.status)) return { status: 'conflict' };
      return {
        status:
          !result || (result.httpStatus ?? 0) >= 500 ? 'retryable' : 'error',
      };
    },
    submit: async ({ assignmentId, expectedRevision, answers }) => {
      const saved = await post(assignmentId, 'draft', {
        expected_revision: expectedRevision,
        intent_key: crypto.randomUUID(),
        answer_values: answers,
      });
      const savedRevision = revision(saved);
      if (saved?.status !== 'saved' || savedRevision === undefined)
        return { status: isConflict(saved?.status) ? 'conflict' : 'error' };

      const result = await post(assignmentId, 'submit', {
        expected_revision: savedRevision,
        intent_key: crypto.randomUUID(),
      });
      if (result?.status === 'submitted')
        return { status: 'submitted', revision: revision(result) };
      return {
        status: isConflict(result?.status) ? 'conflict' : 'error',
        revision: savedRevision,
      };
    },
    correct: async ({ assignmentId, expectedRevision, answers }) => {
      const result = await post(assignmentId, 'corrections', {
        expected_revision: expectedRevision,
        intent_key: crypto.randomUUID(),
        answer_values: answers,
        correction_note: '',
      });
      if (result?.status === 'corrected')
        return { status: 'saved', revision: revision(result) };
      if (isConflict(result?.status)) return { status: 'conflict' };
      return {
        status:
          !result || (result.httpStatus ?? 0) >= 500 ? 'retryable' : 'error',
      };
    },
  };
}

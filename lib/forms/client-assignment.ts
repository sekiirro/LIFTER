import 'server-only';
import type { AnswerHistoryEntry } from '../../components/forms/CorrectionHistory';
import type { LabeledQuestion } from '../../components/forms/QuestionFlow';
import type { FormAnswerSet } from './validation';
import { applicableClientAnswers } from './client-answer-state';
import { buildProfilePrefill, type SignupProfile } from './profile-prefill';
import { createSessionClient } from '../supabase/server';

type LoadedAssignment = {
  status: 'loaded';
  questions: readonly LabeledQuestion[];
  initialAnswers: FormAnswerSet;
  initialRevision: number;
  initialState: 'ready' | 'submitted';
  relationshipActive: boolean;
  history: readonly AnswerHistoryEntry[];
  profileValues: Readonly<Record<string, string>>;
};

export type ClientAssignmentResult =
  LoadedAssignment | { status: 'not_found' } | { status: 'unavailable' };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function answerSet(value: unknown): FormAnswerSet | null {
  return record(value) ? (value as FormAnswerSet) : null;
}

function localizedQuestions(value: unknown): readonly LabeledQuestion[] | null {
  if (!Array.isArray(value)) return null;
  const questions: LabeledQuestion[] = [];
  for (const candidate of value) {
    if (!record(candidate)) return null;
    const copy = record(candidate.title) ? candidate.title : candidate.label;
    if (
      !record(copy) ||
      typeof copy.en !== 'string' ||
      typeof copy.ar !== 'string'
    )
      return null;
    questions.push({ ...candidate, title: copy } as unknown as LabeledQuestion);
  }
  return questions;
}

function historyEntries(value: unknown): AnswerHistoryEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: AnswerHistoryEntry[] = [];
  for (const candidate of value) {
    if (
      !record(candidate) ||
      !Number.isInteger(candidate.revision) ||
      !Number.isSafeInteger(candidate.revision)
    )
      return null;
    const answers = answerSet(candidate.answers);
    if (!answers) return null;
    entries.push({ version: candidate.revision as number, answers });
  }
  return entries;
}

/** Resolve only the signed client's own assignment using session RPCs. */
export async function loadClientAssignment(
  assignmentId: string,
): Promise<ClientAssignmentResult> {
  try {
    const client = await createSessionClient();
    if (!client) return { status: 'not_found' };
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return { status: 'not_found' };

    const { data: context, error: contextError } = await client.rpc(
      'read_form_assignment_context',
      { p_assignment_id: assignmentId },
    );
    if (contextError) return { status: 'unavailable' };
    if (!record(context)) return { status: 'not_found' };
    if (typeof context.relationship_active !== 'boolean')
      return { status: 'unavailable' };
    const snapshot = context.version_snapshot;
    const questions = record(snapshot)
      ? localizedQuestions(snapshot.questions)
      : null;
    if (!questions) return { status: 'not_found' };
    const rawProfile = context.signup_profile;
    const signupProfile: SignupProfile | null =
      record(rawProfile) &&
      typeof rawProfile.full_name === 'string' &&
      (typeof rawProfile.date_of_birth === 'string' ||
        rawProfile.date_of_birth === null)
        ? {
            fullName: rawProfile.full_name,
            dateOfBirth: rawProfile.date_of_birth,
          }
        : null;

    const { data: draftData, error: draftError } = await client.rpc(
      'read_client_form_draft',
      { p_assignment_id: assignmentId },
    );
    if (draftError || !record(draftData)) return { status: 'unavailable' };
    if (draftData.status === 'not_found') return { status: 'not_found' };
    const draftAnswers = answerSet(draftData.answers);
    if (
      draftData.status !== 'loaded' ||
      !draftAnswers ||
      !Number.isInteger(draftData.revision) ||
      !Number.isSafeInteger(draftData.revision)
    )
      return { status: 'unavailable' };

    const { data: historyData, error: historyError } = await client.rpc(
      'read_form_answer',
      {
        p_workspace_id: context.workspace_id,
        p_assignment_id: assignmentId,
        p_view: 'history',
      },
    );
    if (historyError) return { status: 'unavailable' };
    const history = historyEntries(historyData ?? []);
    if (!history) return { status: 'unavailable' };
    const latest = history.at(-1);
    const knownQuestionIds = new Set(questions.map(({ id }) => id));
    const candidateAnswers = latest?.answers ?? draftAnswers;
    const knownAnswers = Object.fromEntries(
      Object.entries(candidateAnswers).filter(([questionId]) =>
        knownQuestionIds.has(questionId),
      ),
    );
    const initialAnswers = applicableClientAnswers(questions, knownAnswers);
    const applicableIds = new Set(Object.keys(initialAnswers));
    const visibleHistory = history.map((entry) => ({
      ...entry,
      answers: Object.fromEntries(
        Object.entries(entry.answers).filter(([questionId]) =>
          applicableIds.has(questionId),
        ),
      ),
    }));
    return {
      status: 'loaded',
      questions,
      initialAnswers,
      initialRevision: latest?.version ?? (draftData.revision as number),
      initialState: latest ? 'submitted' : 'ready',
      relationshipActive: context.relationship_active,
      history: visibleHistory,
      profileValues: buildProfilePrefill(questions, signupProfile, new Date()),
    };
  } catch {
    return { status: 'unavailable' };
  }
}

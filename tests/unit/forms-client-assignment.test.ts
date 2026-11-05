import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({ createSessionClient: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));

import { loadClientAssignment } from '../../lib/forms/client-assignment';

const assignmentId = '3f8e89d7-7c5b-42b0-976a-7ec70f0d71f8';
const context = {
  workspace_id: 'workspace-id',
  relationship_active: true,
  version_snapshot: {
    questions: [
      {
        id: 'goal',
        sectionId: 'basic',
        type: 'shortText',
        required: true,
        title: { en: 'Your goal', ar: 'هدفك' },
      },
    ],
  },
};
const client = {
  auth: { getUser: vi.fn() },
  rpc: vi.fn(),
};

describe('T022 authorized client assignment adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSessionClient.mockResolvedValue(client);
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: 'signed-client' } },
      error: null,
    });
    client.rpc.mockImplementation(async (name: string) => {
      if (name === 'read_form_assignment_context')
        return { data: context, error: null };
      if (name === 'read_client_form_draft')
        return {
          data: {
            status: 'loaded',
            revision: 1,
            answers: { goal: 'strength' },
          },
          error: null,
        };
      if (name === 'read_form_answer') return { data: null, error: null };
      return { data: null, error: { message: 'unexpected RPC' } };
    });
  });

  it('loads only the session client snapshot and audited draft/history', async () => {
    expect(await loadClientAssignment(assignmentId)).toMatchObject({
      status: 'loaded',
      questions: [{ id: 'goal', title: { en: 'Your goal', ar: 'هدفك' } }],
      initialAnswers: { goal: 'strength' },
      initialRevision: 1,
      initialState: 'ready',
      relationshipActive: true,
      history: [],
    });
    expect(mocks.createSessionClient).toHaveBeenCalledOnce();
    expect(client.rpc).toHaveBeenCalledWith('read_form_assignment_context', {
      p_assignment_id: assignmentId,
    });
    expect(client.rpc).toHaveBeenCalledWith('read_client_form_draft', {
      p_assignment_id: assignmentId,
    });
    expect(client.rpc).toHaveBeenCalledWith('read_form_answer', {
      p_workspace_id: 'workspace-id',
      p_assignment_id: assignmentId,
      p_view: 'history',
    });
  });

  it('preserves the authoritative ended-relationship state for the client surface', async () => {
    context.relationship_active = false;
    expect(await loadClientAssignment(assignmentId)).toMatchObject({
      status: 'loaded',
      relationshipActive: false,
    });
  });

  it('returns the same not-found result for foreign and nonexistent assignments', async () => {
    client.rpc.mockResolvedValue({ data: null, error: null });
    const foreign = await loadClientAssignment(assignmentId);
    const missing = await loadClientAssignment(
      '13eba9f4-1551-48ae-bfd2-8c21076533b8',
    );
    expect(foreign).toEqual({ status: 'not_found' });
    expect(missing).toEqual({ status: 'not_found' });
  });

  it('does not convert provider diagnostics into assignment data', async () => {
    client.rpc.mockResolvedValue({
      data: null,
      error: { message: 'private provider detail' },
    });
    expect(await loadClientAssignment(assignmentId)).toEqual({
      status: 'unavailable',
    });
  });

  it('normalizes staff-authored label copy to the client title shape', async () => {
    (
      context.version_snapshot.questions as unknown as Record<string, unknown>[]
    )[0] = {
      id: 'goal',
      sectionId: 'basic',
      type: 'shortText',
      required: true,
      label: { en: 'Your goal', ar: 'هدفك' },
    };
    expect(await loadClientAssignment(assignmentId)).toMatchObject({
      status: 'loaded',
      questions: [{ title: { en: 'Your goal', ar: 'هدفك' } }],
    });
  });

  it('removes values outside the current snapshot before sending history to the client', async () => {
    client.rpc.mockImplementation(async (name: string) => {
      if (name === 'read_form_assignment_context')
        return { data: context, error: null };
      if (name === 'read_client_form_draft')
        return {
          data: { status: 'loaded', revision: 2, answers: { goal: 'current' } },
          error: null,
        };
      return {
        data: [
          {
            revision: 2,
            answers: { goal: 'current', hidden: 'must not reach the browser' },
          },
        ],
        error: null,
      };
    });
    const result = await loadClientAssignment(assignmentId);
    expect(result).toMatchObject({
      status: 'loaded',
      initialState: 'submitted',
      initialAnswers: { goal: 'current' },
      history: [{ version: 2, answers: { goal: 'current' } }],
    });
    expect(JSON.stringify(result)).not.toContain('must not reach the browser');
  });

  it('keeps the production destination off the showcase adapter and service-role client', () => {
    const page = readFileSync(
      'app/(client)/forms/[assignmentId]/page.tsx',
      'utf8',
    );
    const loader = readFileSync('lib/forms/client-assignment.ts', 'utf8');
    const adapter = readFileSync(
      'lib/forms/authorized-client-adapter.ts',
      'utf8',
    );
    expect(page).not.toContain('FormsDemo');
    expect(page).not.toContain('isShowcaseEnabled');
    expect(loader).toContain('createSessionClient');
    expect(loader).toContain("'read_form_assignment_context'");
    expect(loader).toContain("'read_form_answer'");
    expect(loader).not.toContain('createAdminClient');
    expect(adapter).not.toContain('SERVICE_ROLE_KEY');
    expect(adapter).not.toContain('createAdminClient');
  });
});

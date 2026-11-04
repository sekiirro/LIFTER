import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createSessionClient: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));

import { loadClientAssignment } from '../../lib/forms/client-assignment';

const assignmentId = '3f8e89d7-7c5b-42b0-976a-7ec70f0d71f8';
const client = { auth: { getUser: vi.fn() }, rpc: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSessionClient.mockResolvedValue(client);
  client.auth.getUser.mockResolvedValue({
    data: { user: { id: 'self' } },
    error: null,
  });
  client.rpc.mockImplementation(async (name: string) => {
    if (name === 'read_form_assignment_context')
      return {
        data: {
          workspace_id: 'workspace',
          signup_profile: {
            full_name: 'Signup Full Name',
            date_of_birth: '2000-01-01',
          },
          version_snapshot: {
            questions: [
              {
                id: 'B01',
                sectionId: 'basic',
                type: 'profileText',
                required: false,
                profileField: 'fullName',
                title: { en: 'Full name', ar: '' },
              },
              {
                id: 'B02',
                sectionId: 'basic',
                type: 'computedAge',
                required: false,
                dateOfBirthField: 'dateOfBirth',
                title: { en: 'Age', ar: '' },
              },
            ],
          },
        },
        error: null,
      };
    if (name === 'read_client_form_draft')
      return {
        data: { status: 'loaded', revision: 0, answers: {} },
        error: null,
      };
    if (name === 'read_form_answer') return { data: [], error: null };
    return { data: null, error: { message: 'unexpected RPC' } };
  });
});

it('loads only the RPC-authorized signup profile values for the authored read-only questions', async () => {
  const assignment = await loadClientAssignment(assignmentId);
  expect(assignment).toMatchObject({
    status: 'loaded',
    profileValues: { B01: 'Signup Full Name' },
  });
  expect(client.rpc).toHaveBeenCalledWith('read_form_assignment_context', {
    p_assignment_id: assignmentId,
  });
  expect(client.rpc).not.toHaveBeenCalledWith('clients');
});

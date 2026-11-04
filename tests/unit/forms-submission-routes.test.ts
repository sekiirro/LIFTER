import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createSessionClient: vi.fn() }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));

import { GET as readDraft } from '../../app/api/forms/assignments/[assignmentId]/draft/route';
import { POST as submit } from '../../app/api/forms/assignments/[assignmentId]/submit/route';
import { POST as correct } from '../../app/api/forms/assignments/[assignmentId]/corrections/route';

const assignmentId = '3f8e89d7-7c5b-42b0-976a-7ec70f0d71f8';
const intentKey = 'aac73907-46f9-4774-9f31-3fc15746f35a';
const snapshot = {
  questions: [
    { id: 'basic', sectionId: 'basic', type: 'shortText', required: true },
    {
      id: 'training',
      sectionId: 'training',
      type: 'shortText',
      required: true,
    },
    {
      id: 'nutrition',
      sectionId: 'nutrition',
      type: 'shortText',
      required: true,
    },
  ],
};
const validAnswers = {
  basic: 'ok',
  training: 'ok',
  nutrition: 'ok',
};
const client = {
  auth: { getUser: vi.fn() },
  rpc: vi.fn(),
};

function request(path: string, body: unknown) {
  return new NextRequest(`https://lifter.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function expectSafeInvalid(response: Response, code: string) {
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ status: code });
  expect(response.headers.get('cache-control')).toContain('no-store');
}

describe('T013 submission and correction HTTP validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSessionClient.mockResolvedValue(client);
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: 'self' } },
      error: null,
    });
    client.rpc.mockImplementation(async (name: string) => {
      if (
        name === 'read_form_assignment_context' ||
        name === 'read_form_correction_context'
      )
        return {
          data: { workspace_id: 'workspace', version_snapshot: snapshot },
          error: null,
        };
      if (name === 'read_form_answer')
        return { data: validAnswers, error: null };
      return { data: { status: 'submitted' }, error: null };
    });
  });

  it('rejects oversized submission answers before the submission RPC', async () => {
    client.rpc.mockImplementation(async (name: string) =>
      name === 'read_form_assignment_context' ||
      name === 'read_form_correction_context'
        ? {
            data: { workspace_id: 'workspace', version_snapshot: snapshot },
            error: null,
          }
        : {
            data: { ...validAnswers, basic: 'x'.repeat(151) },
            error: null,
          },
    );
    const response = await submit(
      request(`/api/forms/assignments/${assignmentId}/submit`, {
        expected_revision: 1,
        intent_key: intentKey,
      }),
      { params: Promise.resolve({ assignmentId }) },
    );
    await expectSafeInvalid(response, 'answer_too_long');
    expect(client.rpc).toHaveBeenCalledTimes(2);
    expect(client.rpc).not.toHaveBeenCalledWith(
      'submit_form_assignment',
      expect.anything(),
    );
  });

  it('rejects malformed correction metadata before the correction RPC', async () => {
    const response = await correct(
      request(`/api/forms/assignments/${assignmentId}/corrections`, {
        expected_revision: 1,
        intent_key: 'bad-key',
        answer_values: validAnswers,
        correction_note: 'synthetic',
      }),
      { params: Promise.resolve({ assignmentId }) },
    );
    await expectSafeInvalid(response, 'invalid');
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('validates correction answers against the authorized current assignment snapshot', async () => {
    const currentSnapshot = {
      questions: [
        { id: 'current', sectionId: 'basic', type: 'shortText', required: false },
      ],
    };
    client.rpc.mockImplementation(async (name: string) =>
      name === 'read_form_correction_context'
        ? {
            data: {
              workspace_id: 'workspace-current',
              version_snapshot: currentSnapshot,
            },
            error: null,
          }
        : { data: { status: 'corrected' }, error: null },
    );
    const response = await correct(
      request(`/api/forms/assignments/${assignmentId}/corrections`, {
        expected_revision: 1,
        intent_key: intentKey,
        answer_values: { stale_question: 'old snapshot value' },
        correction_note: 'synthetic note',
      }),
      { params: Promise.resolve({ assignmentId }) },
    );
    await expectSafeInvalid(response, 'invalid');
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith('read_form_correction_context', {
      p_assignment_id: assignmentId,
    });
  });

  it('rejects unrecognized fields on both write-route envelopes', async () => {
    const submitResponse = await submit(
      request(`/api/forms/assignments/${assignmentId}/submit`, {
        expected_revision: 1,
        intent_key: intentKey,
        debug: 'must not be reflected',
      }),
      { params: Promise.resolve({ assignmentId }) },
    );
    await expectSafeInvalid(submitResponse, 'invalid');

    client.rpc.mockClear();
    const correctionResponse = await correct(
      request(`/api/forms/assignments/${assignmentId}/corrections`, {
        expected_revision: 1,
        intent_key: intentKey,
        answer_values: validAnswers,
        correction_note: 'synthetic',
        debug: 'must not be reflected',
      }),
      { params: Promise.resolve({ assignmentId }) },
    );
    await expectSafeInvalid(correctionResponse, 'invalid');
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized correction answers and never returns provider diagnostics', async () => {
    const response = await correct(
      request(`/api/forms/assignments/${assignmentId}/corrections`, {
        expected_revision: 1,
        intent_key: intentKey,
        answer_values: { ...validAnswers, basic: 'x'.repeat(151) },
        correction_note: 'synthetic',
      }),
      { params: Promise.resolve({ assignmentId }) },
    );
    await expectSafeInvalid(response, 'answer_too_long');
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('maps RPC failures to the safe unavailable shape for both routes', async () => {
    client.rpc.mockImplementation(async (name: string) =>
      name === 'read_form_assignment_context' ||
      name === 'read_form_correction_context'
        ? {
            data: { workspace_id: 'workspace', version_snapshot: snapshot },
            error: null,
          }
        : name === 'read_form_answer'
          ? { data: validAnswers, error: null }
          : { data: null, error: { message: 'sensitive provider detail' } },
    );
    const submitResponse = await submit(
      request(`/api/forms/assignments/${assignmentId}/submit`, {
        expected_revision: 1,
        intent_key: intentKey,
      }),
      { params: Promise.resolve({ assignmentId }) },
    );
    const correctionResponse = await correct(
      request(`/api/forms/assignments/${assignmentId}/corrections`, {
        expected_revision: 1,
        intent_key: intentKey,
        answer_values: validAnswers,
        correction_note: 'synthetic',
      }),
      { params: Promise.resolve({ assignmentId }) },
    );
    expect(await submitResponse.json()).toEqual({ status: 'unavailable' });
    expect(await correctionResponse.json()).toEqual({ status: 'unavailable' });
  });

  it('loads the revision-paired draft without caching and hides foreign/missing IDs alike', async () => {
    client.rpc.mockResolvedValue({
      data: { status: 'loaded', revision: 0, answers: {} },
      error: null,
    });
    const loaded = await readDraft(
      new NextRequest(
        `https://lifter.test/api/forms/assignments/${assignmentId}/draft`,
      ),
      { params: Promise.resolve({ assignmentId }) },
    );
    expect(loaded.status).toBe(200);
    expect(loaded.headers.get('cache-control')).toContain('no-store');
    expect(await loaded.json()).toEqual({
      status: 'loaded',
      revision: 0,
      answers: {},
    });

    client.rpc.mockResolvedValue({
      data: { status: 'not_found' },
      error: null,
    });
    const foreign = await readDraft(
      new NextRequest(
        `https://lifter.test/api/forms/assignments/${assignmentId}/draft`,
      ),
      { params: Promise.resolve({ assignmentId }) },
    );
    const missingId = '13eba9f4-1551-48ae-bfd2-8c21076533b8';
    const missing = await readDraft(
      new NextRequest(
        `https://lifter.test/api/forms/assignments/${missingId}/draft`,
      ),
      { params: Promise.resolve({ assignmentId: missingId }) },
    );
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
  });
});

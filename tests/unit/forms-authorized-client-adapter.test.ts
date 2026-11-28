import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizedFormsClientAdapter } from '../../lib/forms/authorized-client-adapter';

function response(status: number, payload: unknown) {
  return { status, json: async () => payload } as Response;
}

describe('authorized Forms client adapter submit autosave', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the accepted autosave revision when submission fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200, { status: 'saved', revision: 7 }))
      .mockResolvedValueOnce(response(409, { status: 'conflict' }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'intent-key' });

    const result = await createAuthorizedFormsClientAdapter().submit({
      assignmentId: 'assignment-1',
      expectedRevision: 6,
      answers: { question: 'accepted answer' },
    });

    expect(result).toEqual({ status: 'conflict', revision: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/api/forms/assignments/assignment-1/submit',
    );
    expect(
      JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string),
    ).toMatchObject({
      expected_revision: 7,
    });
  });

  it('does not submit when autosave fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(409, { status: 'conflict' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createAuthorizedFormsClientAdapter().submit({
      assignmentId: 'assignment-1',
      expectedRevision: 6,
      answers: { question: 'unaccepted answer' },
    });

    expect(result).toEqual({ status: 'conflict' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/forms/assignments/assignment-1/draft',
    );
  });

  it('passes remove array in correct payload to corrections route', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(200, { status: 'corrected', revision: 3 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'intent-key-1' });

    const result = await createAuthorizedFormsClientAdapter().correct({
      assignmentId: 'assignment-1',
      expectedRevision: 2,
      answers: {},
      remove: ['consent'],
    });

    expect(result).toEqual({ status: 'saved', revision: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/forms/assignments/assignment-1/corrections',
    );
    expect(
      JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string),
    ).toMatchObject({
      expected_revision: 2,
      answer_values: {},
      remove: ['consent'],
    });
  });
});

describe('authorized Forms client adapter saveDraft status mapping (S74-R4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function saveDraftWith(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal('fetch', fetchMock);
    return createAuthorizedFormsClientAdapter().saveDraft({
      assignmentId: 'assignment-1',
      expectedRevision: 6,
      answers: { question: 'answer' },
      intentKey: 'intent-key',
    });
  }

  it("maps 400 and 422 to 'error'", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(400, { status: 'error' }))
      .mockResolvedValueOnce(response(422, { status: 'error' }));

    expect(await saveDraftWith(fetchMock)).toEqual({ status: 'error' });
    expect(await saveDraftWith(fetchMock)).toEqual({ status: 'error' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/forms/assignments/assignment-1/draft',
    );
  });

  it("maps 408, 429 and 500 to 'retryable'", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(408, { status: 'error' }))
      .mockResolvedValueOnce(response(429, { status: 'error' }))
      .mockResolvedValueOnce(response(500, { status: 'error' }));

    expect(await saveDraftWith(fetchMock)).toEqual({ status: 'retryable' });
    expect(await saveDraftWith(fetchMock)).toEqual({ status: 'retryable' });
    expect(await saveDraftWith(fetchMock)).toEqual({ status: 'retryable' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps a network failure (no response) to 'retryable'", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network down'));

    expect(await saveDraftWith(fetchMock)).toEqual({ status: 'retryable' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leaves submit's mapping unchanged: a 408 draft failure stays 'error'", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(408, { status: 'error' }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'intent-key' });

    const result = await createAuthorizedFormsClientAdapter().submit({
      assignmentId: 'assignment-1',
      expectedRevision: 6,
      answers: { question: 'unaccepted answer' },
    });

    expect(result).toEqual({ status: 'error' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/forms/assignments/assignment-1/draft',
    );
  });
});

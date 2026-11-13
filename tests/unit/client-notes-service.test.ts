import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  createSessionClient: vi.fn(),
  order: vi.fn(),
  rows: [] as Record<string, unknown>[],
  limit: vi.fn(),
  or: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ getActor: mocks.getActor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));

import {
  createClientNote,
  readClientNotes,
} from '../../lib/client-notes/service';

describe('Client Notes list ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: mocks.order,
      limit: mocks.limit,
      or: mocks.or,
      then: (
        resolve: (value: {
          data: Record<string, unknown>[];
          error: null;
        }) => unknown,
      ) => resolve({ data: mocks.rows, error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.or.mockReturnValue(query);
    mocks.rows = [];
    mocks.getActor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: ['10000000-0000-4000-8000-000000000001'],
    });
    mocks.createSessionClient.mockResolvedValue({
      from: vi.fn(() => query),
    });
  });

  it('orders newest-created first with a stable descending ID tie-break', async () => {
    const result = await readClientNotes({
      workspaceId: '10000000-0000-4000-8000-000000000001',
      clientId: '20000000-0000-4000-8000-000000000001',
    });

    expect(result).toEqual({
      status: 'ok',
      notes: [],
      hasMore: false,
      nextCursor: null,
    });
    expect(mocks.order.mock.calls).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
  });

  it('returns one page and a continuation cursor when another page exists', async () => {
    mocks.rows = Array.from({ length: 101 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      created_at: `2026-11-12T10:${String(59 - Math.floor(index / 60)).padStart(2, '0')}:${String(59 - (index % 60)).padStart(2, '0')}Z`,
    }));
    const result = await readClientNotes({
      workspaceId: '10000000-0000-4000-8000-000000000001',
      clientId: '20000000-0000-4000-8000-000000000001',
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected successful page');
    expect(result.notes).toHaveLength(100);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toEqual({
      created_at: result.notes[99]?.created_at,
      id: result.notes[99]?.id,
    });
    expect(mocks.limit).toHaveBeenCalledWith(101);
  });

  it('continues strictly after the created_at/id cursor and detects the final page', async () => {
    const cursor = {
      created_at: '2026-11-12T10:00:00.000Z',
      id: '30000000-0000-4000-8000-000000000001',
    };
    const result = await readClientNotes({
      workspaceId: '10000000-0000-4000-8000-000000000001',
      clientId: '20000000-0000-4000-8000-000000000001',
      cursor,
    });

    expect(result).toMatchObject({ status: 'ok', notes: [], hasMore: false });
    expect(mocks.or).toHaveBeenCalledWith(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  });

  it('walks a stable 1,001-note set through keyset pages exactly once', async () => {
    const all = Array.from({ length: 1001 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      workspace_id: '10000000-0000-4000-8000-000000000001',
      client_id: '20000000-0000-4000-8000-000000000001',
      author_user_id: '30000000-0000-4000-8000-000000000001',
      body: `note-${index}`,
      created_at: new Date(
        Date.UTC(2026, 10, 12, 10, 0, 0) - index * 1000,
      ).toISOString(),
      edited_at: null,
    }));
    const reached: Record<string, unknown>[] = [];
    let cursor: { created_at: string; id: string } | undefined;
    let hasMore = true;
    while (hasMore) {
      const offset = reached.length;
      mocks.rows = all.slice(offset, offset + 101);
      const result = await readClientNotes({
        workspaceId: '10000000-0000-4000-8000-000000000001',
        clientId: '20000000-0000-4000-8000-000000000001',
        ...(cursor ? { cursor } : {}),
      });
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') throw new Error('Expected successful page');
      reached.push(...result.notes);
      hasMore = result.hasMore;
      cursor = result.nextCursor ?? undefined;
    }

    expect(reached.map((note) => note.id)).toEqual(all.map((note) => note.id));
    expect(new Set(reached.map((note) => note.id)).size).toBe(1001);
    expect(mocks.limit).toHaveBeenCalledTimes(11);
  });

  it('refuses invalid body boundaries before reaching the database boundary', async () => {
    for (const body of [
      '',
      ' \t\n',
      '\u00a0',
      'x'.repeat(5001),
      `valid\u0000body`,
    ]) {
      await expect(
        createClientNote({
          workspaceId: '10000000-0000-4000-8000-000000000001',
          clientId: '20000000-0000-4000-8000-000000000001',
          idempotencyKey: 'key',
          body,
        }),
      ).resolves.toEqual({ status: 'invalid_input' });
    }
    expect(mocks.getActor).not.toHaveBeenCalled();
    expect(mocks.createSessionClient).not.toHaveBeenCalled();
  });

  it('accepts a 36-character generated key and refuses a 37-character key before auth', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: '40000000-0000-4000-8000-000000000001',
          workspace_id: '10000000-0000-4000-8000-000000000001',
          client_id: '20000000-0000-4000-8000-000000000001',
          author_user_id: 'trainer',
          body: 'valid body',
          created_at: '2026-11-13T10:00:00Z',
          edited_at: null,
        },
      ],
      error: null,
    });
    mocks.createSessionClient.mockResolvedValueOnce({ rpc });
    const accepted = await createClientNote({
      workspaceId: '10000000-0000-4000-8000-000000000001',
      clientId: '20000000-0000-4000-8000-000000000001',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
      body: 'valid body',
    });
    expect(accepted.status).toBe('ok');
    expect(rpc).toHaveBeenCalledWith(
      'create_client_note',
      expect.objectContaining({
        p_idempotency_key: '00000000-0000-4000-8000-000000000001',
      }),
    );

    mocks.getActor.mockClear();
    const rejected = await createClientNote({
      workspaceId: '10000000-0000-4000-8000-000000000001',
      clientId: '20000000-0000-4000-8000-000000000001',
      idempotencyKey: `cn-1790000000000-${'a'.repeat(20)}`,
      body: 'valid body',
    });
    expect(rejected).toEqual({ status: 'invalid_input' });
    expect(mocks.getActor).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

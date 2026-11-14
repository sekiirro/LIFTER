import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  createSessionClient: vi.fn(),
  order: vi.fn(),
  rpc: vi.fn(),
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
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.getActor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: ['10000000-0000-4000-8000-000000000001'],
    });
    mocks.createSessionClient.mockResolvedValue({
      from: vi.fn(() => query),
      rpc: mocks.rpc,
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

  it('attaches only scoped server-owned author labels to the visible page', async () => {
    const author = '30000000-0000-4000-8000-000000000001';
    mocks.rows = [
      {
        id: '40000000-0000-4000-8000-000000000001',
        workspace_id: '10000000-0000-4000-8000-000000000001',
        client_id: '20000000-0000-4000-8000-000000000001',
        author_user_id: author,
        body: 'note',
        created_at: '2026-11-12T10:00:00Z',
        edited_at: null,
      },
    ];
    mocks.rpc.mockResolvedValue({
      data: [
        { author_user_id: author, display_name: 'Sara Ali', deactivated: true },
      ],
      error: null,
    });
    const result = await readClientNotes({
      workspaceId: '10000000-0000-4000-8000-000000000001',
      clientId: '20000000-0000-4000-8000-000000000001',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('get_client_note_author_names', {
      p_workspace_id: '10000000-0000-4000-8000-000000000001',
      p_author_user_ids: [author],
    });
    expect(result).toMatchObject({
      status: 'ok',
      notes: [{ author_display_name: 'Sara Ali', author_deactivated: true }],
    });
  });

  it('keeps the approved fallback fields when the optional label lookup fails', async () => {
    mocks.rows = [
      {
        id: '40000000-0000-4000-8000-000000000001',
        workspace_id: '10000000-0000-4000-8000-000000000001',
        client_id: '20000000-0000-4000-8000-000000000001',
        author_user_id: '30000000-0000-4000-8000-000000000001',
        body: 'note',
        created_at: '2026-11-12T10:00:00Z',
        edited_at: null,
      },
    ];
    mocks.rpc.mockRejectedValue(new Error('name source unavailable'));
    const result = await readClientNotes({
      workspaceId: '10000000-0000-4000-8000-000000000001',
      clientId: '20000000-0000-4000-8000-000000000001',
    });
    expect(result).toMatchObject({
      status: 'ok',
      notes: [{ author_display_name: null, author_deactivated: false }],
    });
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

  it('keeps surviving older rows ordered when inserts and deletes happen between keyset pages', async () => {
    const makeNote = (index: number, createdAt?: string) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      workspace_id: '10000000-0000-4000-8000-000000000001',
      client_id: '20000000-0000-4000-8000-000000000001',
      author_user_id: '30000000-0000-4000-8000-000000000001',
      body: `note-${index}`,
      created_at:
        createdAt ??
        new Date(Date.UTC(2026, 10, 12, 10, 0, 0) - index * 1000).toISOString(),
      edited_at: null as string | null,
    });
    const original = Array.from({ length: 205 }, (_, index) => makeNote(index));
    const sortNewestFirst = (rows: typeof original) =>
      [...rows].sort(
        (a, b) =>
          b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
      );
    const reached: typeof original = [];
    mocks.rows = original.slice(0, 101);
    const first = await readClientNotes({
      workspaceId: '10000000-0000-4000-8000-000000000001',
      clientId: '20000000-0000-4000-8000-000000000001',
    });
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') throw new Error('Expected first page');
    reached.push(...first.notes);
    let cursor = first.nextCursor;
    expect(cursor).not.toBeNull();

    const live = sortNewestFirst([
      ...original.filter(
        (note) => note.id !== original[5]!.id && note.id !== original[150]!.id,
      ),
      makeNote(999, '2026-11-12T11:00:00.000Z'),
    ]);
    let hasMore = true;
    while (hasMore && cursor) {
      const currentCursor = cursor;
      const afterCursor = live.filter(
        (note) =>
          note.created_at < currentCursor.created_at ||
          (note.created_at === currentCursor.created_at &&
            note.id < currentCursor.id),
      );
      mocks.rows = afterCursor.slice(0, 101);
      const page = await readClientNotes({
        workspaceId: '10000000-0000-4000-8000-000000000001',
        clientId: '20000000-0000-4000-8000-000000000001',
        cursor,
      });
      expect(page.status).toBe('ok');
      if (page.status !== 'ok') throw new Error('Expected continuation page');
      reached.push(...page.notes);
      hasMore = page.hasMore;
      cursor = page.nextCursor;
    }

    const originalAfterFirst = original
      .slice(100)
      .filter((note) => note.id !== original[150]!.id);
    expect(reached.slice(100).map((note) => note.id)).toEqual(
      originalAfterFirst.map((note) => note.id),
    );
    expect(new Set(reached.map((note) => note.id)).size).toBe(reached.length);
    expect(mocks.or).toHaveBeenCalledWith(
      `created_at.lt.${first.nextCursor!.created_at},and(created_at.eq.${first.nextCursor!.created_at},id.lt.${first.nextCursor!.id})`,
    );
    expect(reached.some((note) => note.id === makeNote(999).id)).toBe(false);
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
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        data: [
          {
            author_user_id: 'trainer',
            display_name: 'Sara Ali',
            deactivated: false,
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
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

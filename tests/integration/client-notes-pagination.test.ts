import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  clientNotesFixture,
  type ClientNotesFixture,
} from './client-notes-fixture';

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  createSessionClient: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ getActor: mocks.getActor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));

import { readClientNotes } from '../../lib/client-notes/service';

let fixture: ClientNotesFixture;

beforeAll(async () => {
  fixture = await clientNotesFixture();
});
afterAll(async () => {
  await fixture?.close();
});
beforeEach(() => {
  mocks.getActor.mockResolvedValue({
    userId: fixture.context.trainerA.userId,
    role: 'trainer',
    activeWorkspaceIds: [fixture.workspaceId],
  });
  mocks.createSessionClient.mockResolvedValue(fixture.context.trainerA.client);
});

describe('F20 client notes real-query pagination', () => {
  it('traverses all filtered database pages without duplicates, including the final page', async () => {
    const inserted = await Promise.all(
      Array.from({ length: 205 }, (_, index) =>
        fixture.createAsTrainer({ body: `pagination note ${index}` }),
      ),
    );
    const expectedIds = new Set(inserted.map((note) => String(note.id)));
    const reached: string[] = [];
    const pageLengths: number[] = [];
    let cursor: { created_at: string; id: string } | undefined;
    let hasMore = true;

    while (hasMore) {
      const page = await readClientNotes({
        workspaceId: fixture.workspaceId,
        clientId: fixture.clientId,
        ...(cursor ? { cursor } : {}),
      });
      expect(page.status).toBe('ok');
      if (page.status !== 'ok') throw new Error('Expected a readable page');
      pageLengths.push(page.notes.length);
      reached.push(...page.notes.map((note) => note.id));
      hasMore = page.hasMore;
      cursor = page.nextCursor ?? undefined;
    }

    expect(pageLengths).toEqual([100, 100, 5]);
    expect(reached).toHaveLength(205);
    expect(new Set(reached).size).toBe(205);
    expect(new Set(reached)).toEqual(expectedIds);
  }, 120_000);
});

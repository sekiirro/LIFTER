import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  create: vi.fn(),
  actor: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  filters: [] as unknown[][],
  revision: {
    id: 'b1111111-1111-4111-8111-111111111111',
    workspace_id: 'a1111111-1111-4111-8111-111111111111',
    plan_id: 'c1111111-1111-4111-8111-111111111111',
    revision_number: 4,
    plan_kind: 'workout',
    content: {
      schema_version: 1,
      notes: 'Published note',
      days: [
        {
          id: 'd1111111-1111-4111-8111-111111111111',
          kind: 'rest',
          items: [],
        },
      ],
    },
  },
}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: m.create,
}));
vi.mock('../../lib/auth/actor', () => ({ loadActorRows: m.actor }));
import { GET } from '../../app/api/workouts/copy-prompt/route';
import { getMessages } from '../../lib/i18n';

const wsA = m.revision.workspace_id;
const req = (locale = 'en') =>
  new Request(
    `http://localhost/api/workouts/copy-prompt?revision=${m.revision.id}&locale=${locale}`,
  );

describe('T040 Copy AI Prompt API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.filters = [];
    const client = {
      auth: { getUser: m.getUser },
      from: m.from,
      rpc: vi.fn(),
    };
    m.create.mockResolvedValue(client);
    m.getUser.mockResolvedValue({
      data: { user: { id: 'u1111111-1111-4111-8111-111111111111' } },
      error: null,
    });
    m.actor.mockResolvedValue({
      userId: 'u1111111-1111-4111-8111-111111111111',
      role: 'trainer',
      activeWorkspaceIds: [wsA],
    });
    m.from.mockImplementation((table: string) => {
      const q = {
        select: vi.fn(() => q),
        eq: vi.fn((field: string, value: unknown) => {
          m.filters.push([field, value]);
          return q;
        }),
        maybeSingle: vi.fn(async () => ({ data: m.revision, error: null })),
      };
      expect(table).toBe('plan_revisions');
      return q;
    });
  });

  it('returns only the requested published workout prompt with no-store', async () => {
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ status: 'ok' });
    expect(body.prompt).toContain('Published note');
    expect(body.prompt).toContain('clickable link to its video URL');
    expect(m.filters).toEqual(
      expect.arrayContaining([
        ['id', m.revision.id],
        ['plan_kind', 'workout'],
      ]),
    );
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(getMessages('en')['workout.copyPrompt.action']).toBe(
      'Copy AI Prompt',
    );
    expect(getMessages('en')['workout.copyPrompt.copied']).toBe('Copied.');
    expect(getMessages('ar')['workout.copyPrompt.action']).toBe(
      'نسخ برومبت الذكاء الاصطناعي',
    );
    expect(getMessages('ar')['workout.copyPrompt.copied']).toBe('تم النسخ.');
  });

  it.each([
    ['Sales', 'sales', [wsA]],
    ['unaffiliated', null, []],
    ['foreign workspace', 'trainer', ['a2222222-2222-4222-8222-222222222222']],
  ])(
    'returns generic denial without content for %s',
    async (_label, role, activeWorkspaceIds) => {
      m.actor.mockResolvedValue({ userId: 'u', role, activeWorkspaceIds });
      const res = await GET(req());
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ status: 'unavailable' });
      if (role === 'sales' || role === null)
        expect(m.from).not.toHaveBeenCalled();
    },
  );
});

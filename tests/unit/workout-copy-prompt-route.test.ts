import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  return {
    create: vi.fn(),
    actor: vi.fn(),
    from: vi.fn(),
    rpc: vi.fn(),
    getUser: vi.fn(),
    query,
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
        days: [],
      } as unknown,
    },
  };
});
vi.mock('../../lib/supabase/server', () => ({ createSessionClient: m.create }));
vi.mock('../../lib/auth/actor', () => ({ loadActorRows: m.actor }));
import { GET } from '../../app/api/workouts/copy-prompt/route';
import { getMessages } from '../../lib/i18n';

const ws = m.revision.workspace_id;
const request = (locale: 'en' | 'ar' = 'en') =>
  new Request(`http://local/api?revision=${m.revision.id}&locale=${locale}`);

describe('T040 Copy AI Prompt API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.filters = [];
    m.query.select.mockReturnValue(m.query);
    m.query.eq.mockImplementation((key: string, value: unknown) => {
      m.filters.push([key, value]);
      return m.query;
    });
    m.query.maybeSingle.mockResolvedValue({ data: m.revision, error: null });
    m.from.mockReturnValue(m.query);
    m.create.mockResolvedValue({
      auth: { getUser: m.getUser },
      from: m.from,
      rpc: m.rpc,
    });
    m.getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
    m.actor.mockResolvedValue({
      userId: 'u',
      role: 'trainer',
      activeWorkspaceIds: [ws],
    });
  });

  it('returns only the selected published prompt with approved copy and no-store', async () => {
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: 'ok' });
    expect(body.prompt).toContain('Published note');
    expect(body.prompt).toContain('clickable link to its video URL');
    expect(m.filters).toEqual(
      expect.arrayContaining([
        ['id', m.revision.id],
        ['plan_kind', 'workout'],
      ]),
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    for (const [locale, key, value] of [
      ['en', 'action', 'Copy AI Prompt'],
      ['en', 'copied', 'Copied.'],
      ['ar', 'action', 'نسخ برومبت الذكاء الاصطناعي'],
      ['ar', 'copied', 'تم النسخ.'],
    ] as const)
      expect(getMessages(locale)[`workout.copyPrompt.${key}`]).toBe(value);
  });

  it('uses approved Arabic title and digits-only revision identity in Arabic prompts', async () => {
    const response = await GET(request('ar'));
    const body = await response.json();
    const planLabel = getMessages('ar')['workout.export.plan'];

    expect(response.status).toBe(200);
    expect(body.prompt).not.toContain('Workout plan');
    expect(body.prompt).not.toContain('Revision');
    expect(body.prompt).toContain(
      `${planLabel}: ${planLabel} (${m.revision.revision_number})`,
    );
  });

  it('resolves current authorized Video on every prompt read without changing the revision', async () => {
    const originalContent = {
      schema_version: 1,
      days: [
        {
          id: 'd1111111-1111-4111-8111-111111111111',
          kind: 'session',
          items: [
            {
              id: 'f1111111-1111-4111-8111-111111111111',
              exercise: {
                source: 'global',
                identity_id: 'e1111111-1111-4111-8111-111111111111',
                version: 1,
              },
              name: 'Pinned exercise name',
              alternatives: [],
              sets: [],
            },
          ],
        },
      ],
    };
    m.revision.content = originalContent;
    m.rpc
      .mockResolvedValueOnce({
        data: [
          {
            payload: { name_en: 'Current library name' },
            variation: { video_url: 'https://youtu.be/current-one' },
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            payload: { name_en: 'Current library name' },
            variation: { video_url: 'https://youtu.be/current-two' },
          },
        ],
        error: null,
      });

    const firstResponse = await GET(request());
    const first = await firstResponse.json();
    const secondResponse = await GET(request());
    const second = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(first.prompt).toContain('https://youtu.be/current-one');
    expect(first.prompt).not.toContain('https://youtu.be/current-two');
    expect(second.prompt).toContain('https://youtu.be/current-two');
    expect(second.prompt).not.toContain('https://youtu.be/current-one');
    expect(m.rpc).toHaveBeenCalledTimes(2);
    expect(m.rpc).toHaveBeenNthCalledWith(1, 'catalog_exercise_detail', {
      p_exercise_id: 'e1111111-1111-4111-8111-111111111111',
      p_workspace_id: ws,
    });
    expect(m.revision.content).toEqual(originalContent);
  });

  it.each([
    ['Sales', 'sales', [ws]],
    ['unaffiliated', null, []],
    ['foreign workspace', 'trainer', ['a2222222-2222-4222-8222-222222222222']],
  ])(
    'returns generic no-content denial for %s',
    async (_name, role, activeWorkspaceIds) => {
      m.actor.mockResolvedValue({ userId: 'u', role, activeWorkspaceIds });
      const response = await GET(request());
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ status: 'unavailable' });
      if (role !== 'trainer') expect(m.from).not.toHaveBeenCalled();
    },
  );
});

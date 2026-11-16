import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  return {
    create: vi.fn(),
    actor: vi.fn(),
    from: vi.fn(),
    getUser: vi.fn(),
    query,
    filters: [] as unknown[][],
    revision: {
      id: 'b1111111-1111-4111-8111-111111111111',
      workspace_id: 'a1111111-1111-4111-8111-111111111111',
      plan_id: 'c1111111-1111-4111-8111-111111111111',
      revision_number: 4,
      plan_kind: 'workout',
      content: { schema_version: 1, notes: 'Published note', days: [] },
    },
  };
});
vi.mock('../../lib/supabase/server', () => ({ createSessionClient: m.create }));
vi.mock('../../lib/auth/actor', () => ({ loadActorRows: m.actor }));
import { GET } from '../../app/api/workouts/copy-prompt/route';
import { getMessages } from '../../lib/i18n';

const ws = m.revision.workspace_id;
const request = (locale: 'en' | 'ar' = 'en') =>
  new Request(
    `http://local/api?revision=${m.revision.id}&locale=${locale}`,
  );

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
    m.create.mockResolvedValue({ auth: { getUser: m.getUser }, from: m.from });
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

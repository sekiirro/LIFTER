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
      content: { schema_version: 1, notes: 'Published unit note', days: [] },
    },
  };
});

vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', () => ({ createSessionClient: m.create }));
vi.mock('../../lib/auth/actor', () => ({ loadActorRows: m.actor }));

import { GET } from '../../app/api/workouts/print/route';
import { getMessages } from '../../lib/i18n';

const ws = m.revision.workspace_id;
const request = (locale: 'en' | 'ar' = 'en') =>
  new Request(
    `http://local/api/workouts/print?revision=${m.revision.id}&locale=${locale}`,
  );

describe('T037 PDF Print Route Unit', () => {
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
    m.rpc.mockResolvedValue({ data: null, error: null });
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

  it('returns the authorized published payload with UI-locale labels (EN + AR)', async () => {
    for (const locale of ['en', 'ar'] as const) {
      const res = await GET(request(locale));
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('vary')).toBe('Cookie');
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.payload.planTitle).toBe(
        getMessages(locale)['workout.export.plan'],
      );
      expect(body.payload.planIdentity).toBe('4');
      expect(body.payload.documentNotes).toBe('Published unit note');
      expect(body.payload.days).toEqual([]);
    }
  });

  it('reads the published revisions ledger only (plan_revisions, workout kind)', async () => {
    const res = await GET(request('en'));
    expect(res.status).toBe(200);
    expect(m.from).toHaveBeenCalledWith('plan_revisions');
    expect(m.from).not.toHaveBeenCalledWith('plan_drafts');
    expect(m.filters).toEqual(
      expect.arrayContaining([
        ['id', m.revision.id],
        ['plan_kind', 'workout'],
      ]),
    );
  });

  it('records an identity-only success audit event with no content', async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    const audit = m.rpc.mock.calls.find(
      ([name]) => name === 'record_workout_export_audit',
    );
    expect(audit).toBeDefined();
    expect(audit![1]).toEqual({
      p_workspace_id: ws,
      p_plan_id: m.revision.plan_id,
      p_revision_id: m.revision.id,
      p_format: 'pdf',
      p_outcome: 'success',
      p_reason: null,
    });
    expect(JSON.stringify(audit![1])).not.toContain('Published unit note');
  });

  it('returns the payload as JSON', async () => {
    const res = await GET(request('en'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: 'ok',
      payload: {
        planTitle: expect.any(String),
        planIdentity: '4',
        documentNotes: 'Published unit note',
      },
    });
  });

  it.each([
    ['Sales', 'sales', [ws]],
    ['unaffiliated', null, []],
    ['foreign workspace', 'trainer', ['a2222222-2222-4222-8222-222222222222']],
  ])(
    'returns generic denial 404 with no content in body or logs for %s',
    async (_name, role, activeWorkspaceIds) => {
      m.actor.mockResolvedValue({ userId: 'u', role, activeWorkspaceIds });
      const response = await GET(request());
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ status: 'unavailable' });
      if (role !== 'trainer') expect(m.from).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid or missing revision ID or invalid locale with 404', async () => {
    const res1 = await GET(
      new Request(
        'http://local/api/workouts/print?revision=not-a-uuid&locale=en',
      ),
    );
    expect(res1.status).toBe(404);

    const res2 = await GET(
      new Request('http://local/api/workouts/print?revision=&locale=en'),
    );
    expect(res2.status).toBe(404);

    const res3 = await GET(
      new Request(
        `http://local/api/workouts/print?revision=${m.revision.id}&locale=fr`,
      ),
    );
    expect(res3.status).toBe(404);
  });
});

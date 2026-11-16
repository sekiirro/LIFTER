import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
  loadActorRows: vi.fn(),
  client: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
  },
  selectedFilters: [] as [string, unknown][],
  revision: {
    id: 'b1111111-1111-4111-8111-111111111111',
    workspace_id: 'a1111111-1111-4111-8111-111111111111',
    plan_id: 'c1111111-1111-4111-8111-111111111111',
    revision_number: 4,
    plan_kind: 'workout',
    content: {
      schema_version: 1,
      notes: 'Published document note',
      days: [
        { id: 'd1111111-1111-4111-8111-111111111111', kind: 'rest', items: [] },
      ],
    },
  },
}));

vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));
vi.mock('../../lib/auth/actor', () => ({ loadActorRows: mocks.loadActorRows }));

import { GET } from '../../app/api/workouts/copy-prompt/route';

const workspaceA = 'a1111111-1111-4111-8111-111111111111';
const workspaceB = 'a2222222-2222-4222-8222-222222222222';

function request(locale = 'en') {
  return new Request(
    `http://localhost/api/workouts/copy-prompt?revision=${mocks.revision.id}&locale=${locale}`,
  );
}

describe('F17 Copy AI Prompt API (T040, FR-019, SC-009)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectedFilters = [];
    mocks.client.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u1111111-1111-4111-8111-111111111111' } },
      error: null,
    });
    mocks.createSessionClient.mockResolvedValue(mocks.client);
    mocks.client.from.mockImplementation((table: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn((field: string, value: unknown) => {
          mocks.selectedFilters.push([field, value]);
          return chain;
        }),
        maybeSingle: vi.fn(async () => ({ data: mocks.revision, error: null })),
      };
      expect(table).toBe('plan_revisions');
      return chain;
    });
    mocks.loadActorRows.mockResolvedValue({
      userId: 'u1111111-1111-4111-8111-111111111111',
      role: 'trainer',
      activeWorkspaceIds: [workspaceA],
    });
  });

  it('returns the contract prompt for one selected published revision', async () => {
    const response = await GET(request('en'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.prompt).toContain('Published document note');
    expect(body.prompt).toContain(
      'Make each exercise name and each alternative name a clickable link',
    );
    expect(mocks.selectedFilters).toContainEqual(['id', mocks.revision.id]);
    expect(mocks.selectedFilters).toContainEqual(['plan_kind', 'workout']);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it.each([
    ['Sales', 'sales', [workspaceA]],
    ['unaffiliated', null, []],
    ['foreign workspace', 'trainer', [workspaceB]],
  ])(
    'denies %s without returning prompt content',
    async (_label, role, activeWorkspaceIds) => {
      mocks.loadActorRows.mockResolvedValue({
        userId: 'u1111111-1111-4111-8111-111111111111',
        role,
        activeWorkspaceIds,
      });
      const response = await GET(request());
      const body = await response.json();
      expect(response.status).toBe(404);
      expect(body).toEqual({ status: 'unavailable' });
      if (role === 'sales' || role === null)
        expect(mocks.client.from).not.toHaveBeenCalled();
    },
  );

  it('does not return draft rows or content when the selected revision is missing', async () => {
    mocks.client.from.mockImplementation(() => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      };
      return chain;
    });
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ status: 'unavailable' });
  });
});

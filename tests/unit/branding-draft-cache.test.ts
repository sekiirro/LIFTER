import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
  loadActorRows: vi.fn(),
  authorize: vi.fn(),
  getDraft: vi.fn(),
}));

vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));
vi.mock('../../lib/auth/actor', () => ({ loadActorRows: mocks.loadActorRows }));
vi.mock('../../lib/auth/authorize', () => ({ authorize: mocks.authorize }));
vi.mock('../../lib/branding/repository', () => ({
  createSupabaseBrandingRepository: () => ({ getDraft: mocks.getDraft }),
}));

import { GET } from '../../app/api/branding/draft/route';

const workspace = '11111111-1111-4111-8111-111111111111';

afterEach(() => vi.resetAllMocks());

function authorizeOwner() {
  mocks.createSessionClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'owner-1' } },
        error: null,
      }),
    },
  });
  mocks.loadActorRows.mockResolvedValue({ id: 'owner-1', role: 'owner' });
  mocks.authorize.mockReturnValue(true);
}

it('Q-M16: authorized draft response carries private and no-store cache directives', async () => {
  authorizeOwner();
  const draft = { color: '#0B6E4F', logo: null, banner: null };
  mocks.getDraft.mockResolvedValue(draft);

  const response = await GET(
    new Request(
      `https://example.test/api/branding/draft?workspace=${workspace}`,
    ),
  );

  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('vary')).toBe('Cookie');
  expect(await response.json()).toEqual(draft);
});

it('Q-M16: denied draft response carries private and no-store cache directives', async () => {
  authorizeOwner();
  mocks.authorize.mockReturnValue(false);

  const response = await GET(
    new Request(
      `https://example.test/api/branding/draft?workspace=${workspace}`,
    ),
  );

  expect(response.status).toBe(404);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});

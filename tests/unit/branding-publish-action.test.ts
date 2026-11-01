import { beforeEach, expect, it, vi } from 'vitest';
import { publishBrandingAction } from '../../app/(dashboard)/branding/actions';
import { BrandingValidationError } from '../../lib/branding/validation';
import { getMessages } from '../../lib/i18n';

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(),
  authorize: vi.fn(),
  createBrandingService: vi.fn(),
  createSessionClient: vi.fn(),
  publishDraft: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('../../lib/auth/actor', () => ({
  requireActor: mocks.requireActor,
}));
vi.mock('../../lib/auth/authorize', () => ({ authorize: mocks.authorize }));
vi.mock('../../lib/branding/service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/branding/service')>();
  return {
    ...actual,
    createBrandingService: mocks.createBrandingService,
  };
});
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireActor.mockResolvedValue({ userId: 'user-1', role: 'owner' });
  mocks.authorize.mockReturnValue(true);
  mocks.createSessionClient.mockResolvedValue({});
  mocks.createBrandingService.mockReturnValue({
    publishDraft: mocks.publishDraft,
  });
  mocks.publishDraft.mockRejectedValue(
    new BrandingValidationError('Branding fields are invalid'),
  );
  mocks.redirect.mockImplementation(() => {
    throw new Error('redirect');
  });
});

it('routes publish validation failures to the generic localized invalid status', async () => {
  const form = new FormData();
  form.set('workspaceId', 'workspace-1');
  form.set('revision', '3');

  await expect(publishBrandingAction(form)).rejects.toThrow('redirect');

  expect(mocks.redirect).toHaveBeenCalledWith(
    '/branding?workspace=workspace-1&status=invalid_branding',
  );
  expect(getMessages('en')).toHaveProperty('branding.invalidFields');
  expect(getMessages('ar')).toHaveProperty('branding.invalidFields');
});

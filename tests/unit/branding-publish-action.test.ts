import { beforeEach, expect, it, vi } from 'vitest';
import {
  publishBrandingAction,
  saveBrandingAction,
} from '../../app/(dashboard)/branding/actions';
import { BrandingServiceError } from '../../lib/branding/service';
import { BrandingValidationError } from '../../lib/branding/validation';
import { getMessages } from '../../lib/i18n';

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(),
  authorize: vi.fn(),
  createBrandingService: vi.fn(),
  createSessionClient: vi.fn(),
  saveDraft: vi.fn(),
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
    saveDraft: mocks.saveDraft,
    publishDraft: mocks.publishDraft,
  });
  mocks.saveDraft.mockResolvedValue({});
  mocks.publishDraft.mockRejectedValue(
    new BrandingValidationError('Branding fields are invalid'),
  );
  mocks.redirect.mockImplementation(() => {
    throw new Error('redirect');
  });
});

function saveForm({
  ar = '',
  en = '',
}: {
  ar?: string;
  en?: string;
} = {}) {
  const form = new FormData();
  form.set('workspaceId', 'workspace-1');
  form.set('revision', '3');
  form.set('nameAr', 'اسم المساحة');
  form.set('nameEn', 'Workspace name');
  form.set('color', '#123456');
  form.set('bannerAltAr', ar);
  form.set('bannerAltEn', en);
  return form;
}

it.each([
  {
    label: 'Arabic only',
    ar: '  وصف اللافتة  ',
    en: '',
    expected: { ar: 'وصف اللافتة', en: '' },
  },
  {
    label: 'English only',
    ar: '',
    en: '  Banner description  ',
    expected: { ar: '', en: 'Banner description' },
  },
  {
    label: 'both locales',
    ar: '  وصف اللافتة  ',
    en: '  Banner description  ',
    expected: { ar: 'وصف اللافتة', en: 'Banner description' },
  },
])(
  'forwards trimmed $label banner alt text with the existing revision',
  async ({ ar, en, expected }) => {
    await expect(saveBrandingAction(saveForm({ ar, en }))).rejects.toThrow(
      'redirect',
    );

    expect(mocks.saveDraft).toHaveBeenCalledWith({
      actor: { id: 'user-1', role: 'owner' },
      workspaceId: 'workspace-1',
      expectedRevision: 3,
      fields: {
        names: { ar: 'اسم المساحة', en: 'Workspace name' },
        color: '#123456',
        bannerAltText: expected,
      },
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      '/branding?workspace=workspace-1&status=saved',
    );
  },
);

it('clearing both banner alt fields clears saved alt text', async () => {
  await expect(saveBrandingAction(saveForm())).rejects.toThrow('redirect');

  expect(mocks.saveDraft).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedRevision: 3,
      fields: {
        names: { ar: 'اسم المساحة', en: 'Workspace name' },
        color: '#123456',
        bannerAltText: { ar: '', en: '' },
      },
    }),
  );
});

it('maps a stale draft revision to the stale status', async () => {
  mocks.saveDraft.mockRejectedValue(
    new BrandingServiceError('Draft revision is stale', 'stale_revision'),
  );

  await expect(
    saveBrandingAction(saveForm({ en: 'Description' })),
  ).rejects.toThrow('redirect');

  expect(mocks.redirect).toHaveBeenCalledWith(
    '/branding?workspace=workspace-1&status=stale',
  );
});

it('denies publish when an attached banner has both alt fields empty', async () => {
  const form = new FormData();
  form.set('workspaceId', 'workspace-1');
  form.set('revision', '3');
  mocks.publishDraft.mockRejectedValue(
    new BrandingValidationError('Banner alt text is required to publish'),
  );

  await expect(publishBrandingAction(form)).rejects.toThrow('redirect');

  expect(mocks.redirect).toHaveBeenCalledWith(
    '/branding?workspace=workspace-1&status=invalid_branding',
  );
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

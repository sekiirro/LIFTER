'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authorize } from '../../../lib/auth/authorize';
import { requireActor } from '../../../lib/auth/actor';
import {
  createBrandingService,
  BrandingServiceError,
} from '../../../lib/branding/service';
import { createSupabaseBrandingRepository } from '../../../lib/branding/repository';
import { createSessionClient } from '../../../lib/supabase/server';

async function authorized(workspaceId: string) {
  const actor = await requireActor();
  if (!actor.role || !authorize(actor, 'manage_branding', workspaceId)) {
    redirect('/branding?status=unavailable');
  }
  const client = await createSessionClient();
  if (!client) redirect('/branding?status=unavailable');
  return {
    actor,
    service: createBrandingService({
      repository: createSupabaseBrandingRepository(client),
      authorize: (_actor, scope) => authorize(actor, 'manage_branding', scope),
    }),
  };
}

function field(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

export async function saveBrandingAction(form: FormData): Promise<void> {
  const workspaceId = field(form, 'workspaceId');
  const { actor, service } = await authorized(workspaceId);
  let status = 'saved';
  try {
    await service.saveDraft({
      actor: { id: actor.userId, role: actor.role ?? undefined },
      workspaceId,
      expectedRevision: Number(field(form, 'revision')),
      fields: {
        names: { ar: field(form, 'nameAr'), en: field(form, 'nameEn') },
        color: field(form, 'color'),
      },
    });
  } catch (error) {
    status =
      error instanceof BrandingServiceError && error.code === 'stale_revision'
        ? 'stale'
        : 'unavailable';
  }
  revalidatePath('/branding');
  redirect(
    `/branding?workspace=${encodeURIComponent(workspaceId)}&status=${status}`,
  );
}

export async function publishBrandingAction(form: FormData): Promise<void> {
  const workspaceId = field(form, 'workspaceId');
  const { actor, service } = await authorized(workspaceId);
  let status = 'published';
  try {
    await service.publishDraft({
      actor: { id: actor.userId, role: actor.role ?? undefined },
      workspaceId,
      expectedRevision: Number(field(form, 'revision')),
    });
  } catch (error) {
    status =
      error instanceof BrandingServiceError && error.code === 'stale_revision'
        ? 'stale'
        : 'unavailable';
  }
  revalidatePath('/branding');
  redirect(
    `/branding?workspace=${encodeURIComponent(workspaceId)}&status=${status}`,
  );
}

'use server';

import { getActor } from '../../../lib/auth/actor';
import { roleHasCapability } from '../../../lib/auth/capabilities';
import { createPersistedFormsStaffAdapter } from '../../../lib/forms/persisted-staff-adapter';
import type {
  FormsStaffAdapter,
  FormsStaffRole,
  FormsStaffResult,
  FormsStaffSelectionResult,
  StaffFormDraft,
} from '../../../lib/forms/staff-contracts';
import { createSessionClient } from '../../../lib/supabase/server';

async function authenticatedAdapter(workspaceId: string): Promise<{
  adapter: FormsStaffAdapter;
  client: NonNullable<Awaited<ReturnType<typeof createSessionClient>>>;
  role: FormsStaffRole;
} | null> {
  const actor = await getActor();
  if (
    !actor?.role ||
    !roleHasCapability(actor.role, 'author_forms') ||
    (actor.role !== 'platform_owner' &&
      !actor.activeWorkspaceIds.includes(workspaceId))
  )
    return null;

  const client = await createSessionClient();
  if (!client) return null;
  const role: FormsStaffRole =
    actor.role === 'platform_owner'
      ? 'po'
      : actor.role === 'workspace_owner'
        ? 'wo'
        : 'trainer';
  return {
    adapter: createPersistedFormsStaffAdapter(client, workspaceId),
    client,
    role,
  };
}

export async function formsStaffLoad(workspaceId: string) {
  const context = await authenticatedAdapter(workspaceId);
  if (!context) throw new Error('Workspace forms are unavailable');
  return context.adapter.load();
}

export async function formsStaffSaveDraft(
  workspaceId: string,
  form: StaffFormDraft,
  requestId?: string,
): Promise<FormsStaffResult> {
  const context = await authenticatedAdapter(workspaceId);
  if (!context) return { status: 'forbidden' };
  return context.adapter.saveDraft(context.role, form, requestId);
}

export async function formsStaffPublish(
  workspaceId: string,
  formId: string,
  requestId?: string,
): Promise<FormsStaffResult> {
  const context = await authenticatedAdapter(workspaceId);
  if (!context) return { status: 'forbidden' };
  return context.adapter.publish(context.role, formId, requestId);
}

export async function formsStaffRetire(
  workspaceId: string,
  formId: string,
  requestId?: string,
): Promise<FormsStaffResult> {
  const context = await authenticatedAdapter(workspaceId);
  if (!context) return { status: 'forbidden' };
  return context.adapter.retire(context.role, formId, requestId);
}

export async function formsStaffCopy(
  workspaceId: string,
  formId: string,
  requestId?: string,
): Promise<FormsStaffResult> {
  const context = await authenticatedAdapter(workspaceId);
  if (!context) return { status: 'forbidden' };
  return context.adapter.copy(context.role, formId, requestId);
}

export async function formsStaffSelectDefault(
  workspaceId: string,
  formId: string,
): Promise<FormsStaffSelectionResult> {
  const context = await authenticatedAdapter(workspaceId);
  if (!context) return { status: 'forbidden' };
  return context.adapter.selectDefaultOnboardingForm(context.role, formId);
}

export async function formsStaffPublishedColor(workspaceId: string) {
  const context = await authenticatedAdapter(workspaceId);
  if (!context) return null;
  const { data, error } = await context.client.rpc('branding_current_read', {
    workspace_id: workspaceId,
  });
  if (error || !data || typeof data !== 'object' || !('color' in data))
    return null;
  return typeof data.color === 'string' ? data.color : null;
}

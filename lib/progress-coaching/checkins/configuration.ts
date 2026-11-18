import 'server-only';
import { getActor } from '../../auth/actor';
import { authorize } from '../../auth/authorize';
import { isUuid } from '../../client-notes/validation';
import { createSessionClient } from '../../supabase/server';
import {
  parseCheckinConfiguration,
  type CheckinConfigurationResult,
  type CheckinConfigureStatus,
} from './configuration-types';

export type {
  CheckinConfigurationResult,
  CheckinConfigureStatus,
  CheckinFormOption,
} from './configuration-types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** App-layer wall mirroring configure_weekly_checkin_form (assign_intake_form). */
async function configSession(workspaceId: unknown) {
  if (!isUuid(workspaceId)) return null;
  const actor = await getActor();
  if (!actor || !authorize(actor, 'assign_intake_form', workspaceId))
    return null;
  return createSessionClient();
}

export async function readCheckinConfiguration(
  workspaceId: string,
): Promise<CheckinConfigurationResult> {
  const session = await configSession(workspaceId);
  if (!session) return { status: 'denied' };
  const result = await session.rpc('weekly_checkin_configuration', {
    p_workspace_id: workspaceId,
  });
  if (result.error)
    return {
      status: result.error.code === '42501' ? 'denied' : 'unavailable',
    };
  return parseCheckinConfiguration(result.data);
}

/** `raw` is untrusted server-action input: { workspaceId, formId, versionNumber }. */
export async function configureCheckinForm(
  raw: unknown,
): Promise<{ status: CheckinConfigureStatus }> {
  if (!isRecord(raw)) return { status: 'invalid' };
  const { workspaceId, formId, versionNumber } = raw;
  if (
    !isUuid(workspaceId) ||
    !isUuid(formId) ||
    typeof versionNumber !== 'number' ||
    !Number.isInteger(versionNumber) ||
    versionNumber < 1
  )
    return { status: 'invalid' };
  const session = await configSession(workspaceId);
  if (!session) return { status: 'denied' };
  const result = await session.rpc('configure_weekly_checkin_form', {
    p_workspace_id: workspaceId,
    p_form_id: formId,
    p_version_number: versionNumber,
  });
  if (result.error)
    return {
      status: result.error.code === '42501' ? 'denied' : 'unavailable',
    };
  const status = isRecord(result.data) ? result.data.status : undefined;
  return status === 'configured' ||
    status === 'invalid' ||
    status === 'conflict' ||
    status === 'not_found'
    ? { status }
    : { status: 'unavailable' };
}

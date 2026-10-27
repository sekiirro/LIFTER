import 'server-only';
import { getActor } from '../auth/actor';
import { authorize } from '../auth/authorize';
import { createSessionClient } from '../supabase/server';
import { exactKeys, isUuid, parseSchedule } from './validation';
import {
  generateToken,
  hashToken,
  registrationOrigin,
  registrationUrl,
} from './token';
import { mapRegistrationError, type IssueResult } from './results';
export async function issueRegistrationLink(
  input: unknown,
): Promise<IssueResult> {
  try {
    const actor = await getActor();
    const data =
      input && typeof input === 'object' && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    if (
      !actor ||
      !isUuid(data.workspaceId) ||
      !authorize(actor, 'generate_registration_link', data.workspaceId)
    )
      return { status: 'not_permitted' };
    if (
      data.installments !== null &&
      !authorize(actor, 'configure_installment_schedule', data.workspaceId)
    )
      return { status: 'not_permitted' };
    if (
      !exactKeys(data, ['workspaceId', 'packageVersionId', 'installments']) ||
      !isUuid(data.packageVersionId)
    )
      return { status: 'invalid_input' };
    const rows = parseSchedule(data.installments);
    if (rows === undefined) return { status: 'invalid_input' };
    const origin = registrationOrigin(process.env.APP_ORIGIN);
    if (!origin) return { status: 'unavailable' };
    const client = await createSessionClient();
    if (!client) return { status: 'unavailable' };
    const token = generateToken();
    const result = await client.rpc('issue_registration_link', {
      workspace_id: data.workspaceId,
      package_version_id: data.packageVersionId,
      token_hash: hashToken(token),
      installments:
        rows === null
          ? null
          : rows.map((r) => ({
              seq: r.seq,
              amount_minor: r.amountMinor,
              due_offset_days: r.dueOffsetDays,
            })),
    });
    if (result.error) return mapRegistrationError(result.error);
    if (!isUuid(result.data)) return { status: 'unavailable' };
    return {
      status: 'ok',
      linkId: result.data,
      link: registrationUrl(origin, token),
    };
  } catch {
    return { status: 'unavailable' };
  }
}

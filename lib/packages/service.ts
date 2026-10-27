import 'server-only';
import { getActor } from '../auth/actor';
import { authorize } from '../auth/authorize';
import { createSessionClient } from '../supabase/server';
import { inputRecord, isUuid, parseCode, parseTerms } from './validation';
import {
  mapPackageError,
  type CreatePackageResult,
  type PublishPackageResult,
  type AvailabilityResult,
} from './results';
async function pricingContext(input: Record<string, unknown>) {
  const actor = await getActor();
  if (
    !actor ||
    actor.role !== 'platform_owner' ||
    !isUuid(input.workspaceId) ||
    !authorize(actor, 'set_package_pricing', input.workspaceId)
  )
    return { status: 'denied' } as const;
  const client = await createSessionClient();
  if (!client) return { status: 'unavailable' } as const;
  return { status: 'ok', client, workspaceId: input.workspaceId } as const;
}
export async function createPackage(
  input: unknown,
): Promise<CreatePackageResult> {
  try {
    const data = inputRecord(input);
    const ctx = await pricingContext(data);
    if (ctx.status !== 'ok') return ctx;
    const code = parseCode(data.code);
    if (code === null) return { status: 'invalid_input' };
    const workspace = await ctx.client
      .from('workspaces')
      .select('id')
      .eq('id', ctx.workspaceId)
      .maybeSingle();
    if (workspace.error) return { status: 'unavailable' };
    if (!workspace.data) return { status: 'denied' };
    const result = await ctx.client.rpc('create_package', { code });
    if (result.error) return mapPackageError(result.error);
    return isUuid(result.data)
      ? { status: 'ok', packageId: result.data }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
export async function publishPackageVersion(
  input: unknown,
): Promise<PublishPackageResult> {
  try {
    const data = inputRecord(input);
    const ctx = await pricingContext(data);
    if (ctx.status !== 'ok') return ctx;
    if (!isUuid(data.packageId)) return { status: 'denied' };
    const terms = parseTerms(data);
    if (!terms) return { status: 'invalid_input' };
    const result = await ctx.client.rpc('publish_package_version', {
      workspace_id: ctx.workspaceId,
      package_id: data.packageId,
      duration_months: terms.durationMonths,
      duration_days: terms.durationDays,
      name_ar: terms.nameAr,
      name_en: terms.nameEn,
      price_minor: terms.priceMinor,
      currency: terms.currency,
      commission_rate_bp: terms.commissionRateBp,
    });
    if (result.error) return mapPackageError(result.error);
    return isUuid(result.data)
      ? { status: 'ok', versionId: result.data }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
export async function setPackageOfferAvailable(
  input: unknown,
): Promise<AvailabilityResult> {
  try {
    const data = inputRecord(input);
    const ctx = await pricingContext(data);
    if (ctx.status !== 'ok') return ctx;
    if (!isUuid(data.offerId)) return { status: 'denied' };
    if (typeof data.available !== 'boolean') return { status: 'invalid_input' };
    const result = await ctx.client.rpc('set_package_offer_available', {
      workspace_id: ctx.workspaceId,
      offer_id: data.offerId,
      available: data.available,
    });
    if (result.error) return mapPackageError(result.error);
    return result.data === data.offerId
      ? { status: 'ok', offerId: result.data }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

import 'server-only';
import { getActor } from '../auth/actor';
import { authorize } from '../auth/authorize';
import { createSessionClient } from '../supabase/server';
import {
  inputRecord,
  isCurrencyAllowedForMarket,
  isPackageMarket,
  isPackageType,
  isUuid,
  PACKAGE_MARKETS,
  PACKAGE_TYPES,
  parseCategoryIdentity,
  parseCode,
  parseTerms,
} from './validation';
import {
  mapPackageError,
  type CreatePackageResult,
  type InitializeCategoriesResult,
  type InitializedCategory,
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
async function verifiedPricingWorkspace(input: Record<string, unknown>) {
  const ctx = await pricingContext(input);
  if (ctx.status !== 'ok') return ctx;
  const workspace = await ctx.client
    .from('workspaces')
    .select('id')
    .eq('id', ctx.workspaceId)
    .maybeSingle();
  if (workspace.error) return { status: 'unavailable' } as const;
  if (!workspace.data) return { status: 'denied' } as const;
  return ctx;
}
export async function createPackage(
  input: unknown,
): Promise<CreatePackageResult> {
  try {
    const data = inputRecord(input);
    const ctx = await verifiedPricingWorkspace(data);
    if (ctx.status !== 'ok') return ctx;
    const code = parseCode(data.code);
    if (code === null) return { status: 'invalid_input' };
    const result = await ctx.client.rpc('create_package', { code });
    if (result.error) return mapPackageError(result.error);
    return isUuid(result.data)
      ? { status: 'ok', packageId: result.data }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
export async function createPackageCategory(
  input: unknown,
): Promise<CreatePackageResult> {
  try {
    const data = inputRecord(input);
    const ctx = await pricingContext(data);
    if (ctx.status !== 'ok') return ctx;
    const category = parseCategoryIdentity({
      workspaceId: ctx.workspaceId,
      market: data.market,
      type: data.type,
    });
    if (!category) return { status: 'invalid_input' };
    const verified = await verifiedPricingWorkspace(data);
    if (verified.status !== 'ok') return verified;
    const result = await verified.client.rpc('create_package_category', {
      workspace_id: category.workspaceId,
      market: category.market,
      category_type: category.type,
    });
    if (result.error) return mapPackageError(result.error);
    return isUuid(result.data)
      ? { status: 'ok', packageId: result.data }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
const EXPECTED_CATEGORY_PAIRS = PACKAGE_MARKETS.length * PACKAGE_TYPES.length;
function parseInitializedCategories(
  data: unknown,
): InitializedCategory[] | null {
  if (!Array.isArray(data) || data.length !== EXPECTED_CATEGORY_PAIRS) {
    return null;
  }
  const seen = new Set<string>();
  const categories: InitializedCategory[] = [];
  for (const row of data) {
    const record = inputRecord(row);
    if (
      !isUuid(record.package_id) ||
      !isPackageMarket(record.market) ||
      !isPackageType(record.category_type)
    ) {
      return null;
    }
    const key = `${record.market}:${record.category_type}`;
    if (seen.has(key)) return null;
    seen.add(key);
    categories.push({
      packageId: record.package_id,
      market: record.market,
      type: record.category_type,
    });
  }
  return seen.size === EXPECTED_CATEGORY_PAIRS ? categories : null;
}
export async function initializePackageCategories(
  input: unknown,
): Promise<InitializeCategoriesResult> {
  try {
    const data = inputRecord(input);
    const ctx = await verifiedPricingWorkspace(data);
    if (ctx.status !== 'ok') return ctx;
    const result = await ctx.client.rpc(
      'initialize_workspace_package_categories',
      { workspace_id: ctx.workspaceId },
    );
    if (result.error) return mapPackageError(result.error);
    const categories = parseInitializedCategories(result.data);
    return categories
      ? { status: 'ok', categories }
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
    const category = await ctx.client
      .from('packages')
      .select('id,workspace_id,market,type')
      .eq('id', data.packageId)
      .maybeSingle();
    if (category.error) return { status: 'unavailable' };
    if (
      !category.data ||
      category.data.workspace_id !== ctx.workspaceId ||
      !parseCategoryIdentity({
        workspaceId: category.data.workspace_id,
        market: category.data.market,
        type: category.data.type,
      })
    )
      return { status: 'denied' };
    if (!isCurrencyAllowedForMarket(category.data.market, terms.currency))
      return { status: 'invalid_input' };
    const result = await ctx.client.rpc('publish_package_version', {
      workspace_id: ctx.workspaceId,
      package_id: data.packageId,
      tier_rank: terms.tierRank,
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

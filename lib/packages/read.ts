import 'server-only';
import type { Actor } from '../auth/authorize';
import { authorize } from '../auth/authorize';
import { createSessionClient } from '../supabase/server';
import { isUuid, parsePrice } from './validation';
import type { PackageFailure } from './results';
export const SAFE_VERSION_COLUMNS =
  'workspace_id,id,offer_id,version,name_ar,name_en,price_minor,currency,duration_days,duration_months,published_at,published_by';
export type PackageIdentity = {
  id: string;
  code: string;
  created_at: string;
  created_by: string;
};
export type PackageOffer = {
  id: string;
  workspace_id: string;
  package_id: string;
  tier_rank: 1 | 2 | 3;
  duration_days: number;
  duration_months: number | null;
  available: boolean;
  current_version_id: string | null;
};
export type PackageVersion = {
  workspace_id: string;
  id: string;
  offer_id: string;
  version: number;
  name_ar: string;
  name_en: string;
  price_minor: string;
  currency: string;
  duration_days: number;
  duration_months: number | null;
  published_at: string;
  published_by: string;
  commission_rate_bp?: number;
};
export type PackageReadResult =
  | {
      status: 'ok';
      packages: PackageIdentity[];
      offers: PackageOffer[];
      versions: PackageVersion[];
    }
  | PackageFailure;
export async function loadPackageOffers(
  actor: Actor | null,
  workspaceId: string,
): Promise<PackageReadResult> {
  if (
    !actor ||
    !isUuid(workspaceId) ||
    !authorize(actor, 'generate_registration_link', workspaceId)
  )
    return { status: 'denied' };
  try {
    const client = await createSessionClient();
    if (!client) return { status: 'unavailable' };
    const workspace = await client
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .maybeSingle();
    if (workspace.error) return { status: 'unavailable' };
    if (!workspace.data) return { status: 'denied' };
    const [packages, offers, versions] = await Promise.all([
      client.from('packages').select('id,code,created_at,created_by'),
      client
        .from('package_offers')
        .select(
          'id,workspace_id,package_id,duration_days,duration_months,tier_rank,available,current_version_id',
        )
        .eq('workspace_id', workspaceId),
      client
        .from('package_versions_safe')
        .select(SAFE_VERSION_COLUMNS)
        .eq('workspace_id', workspaceId),
    ]);
    if (
      packages.error ||
      offers.error ||
      versions.error ||
      !packages.data ||
      !offers.data ||
      !versions.data
    )
      return { status: 'unavailable' };
    if (
      versions.data.some(
        (v) =>
          typeof v.price_minor !== 'string' ||
          parsePrice(v.price_minor) === null,
      )
    )
      return { status: 'unavailable' };
    // Copy a safe allow-list even when a future provider projection changes. No hidden rate field survives.
    let safeVersions: PackageVersion[] = versions.data.map((v) => ({
      workspace_id: v.workspace_id,
      id: v.id,
      offer_id: v.offer_id,
      version: v.version,
      name_ar: v.name_ar,
      name_en: v.name_en,
      price_minor: v.price_minor,
      currency: v.currency,
      duration_days: v.duration_days,
      duration_months: v.duration_months,
      published_at: v.published_at,
      published_by: v.published_by,
    }));
    if (
      (actor.role === 'platform_owner' || actor.role === 'workspace_owner') &&
      authorize(actor, 'generate_registration_link', workspaceId)
    ) {
      const rates = await client.rpc('get_package_version_commissions', {
        workspace_id: workspaceId,
      });
      if (rates.error || !Array.isArray(rates.data))
        return { status: 'unavailable' };
      const byId = new Map<string, number>(
        rates.data.map(
          (r: { version_id: string; commission_rate_bp: number }) => [
            r.version_id,
            r.commission_rate_bp,
          ],
        ),
      );
      if (safeVersions.some((v) => !byId.has(v.id)))
        return { status: 'unavailable' };
      safeVersions = safeVersions.map((v) => ({
        ...v,
        commission_rate_bp: byId.get(v.id)!,
      }));
    }
    return {
      status: 'ok',
      packages: packages.data,
      offers: offers.data,
      versions: safeVersions,
    };
  } catch {
    return { status: 'unavailable' };
  }
}
export async function loadPackageManagement(
  actor: Actor | null,
  workspaceId: string,
): Promise<PackageReadResult> {
  if (
    !actor ||
    actor.role !== 'platform_owner' ||
    !isUuid(workspaceId) ||
    !authorize(actor, 'set_package_pricing', workspaceId)
  )
    return { status: 'denied' };
  return loadPackageOffers(actor, workspaceId);
}

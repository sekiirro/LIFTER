import 'server-only';
import { getActor } from '../auth/actor';
import { authorize, type Actor } from '../auth/authorize';
import { createSessionClient } from '../supabase/server';
import { tierLabel, type TierRank } from './tier-label';
import { inputRecord, isPackageName, isUuid, parseInteger } from './validation';
import { mapPackageError, type PackageFailure } from './results';

export const TIER_LOCALES = ['ar', 'en'] as const;
export type TierLocale = (typeof TIER_LOCALES)[number];
export type TierNameMutationResult = { status: 'ok' } | PackageFailure;
export type ResolvedTierName = {
  tierRank: TierRank;
  locale: TierLocale;
  name: string;
};
export type TierNameReadResult =
  { status: 'ok'; names: ResolvedTierName[] } | PackageFailure;

const TIER_RANK_SET: ReadonlySet<unknown> = new Set([1, 2, 3]);
const TIER_LOCALE_SET: ReadonlySet<unknown> = new Set<string>(TIER_LOCALES);

// Reuse the package publication-name validator for identical normalization.
export function isTierName(value: unknown): value is string {
  return isPackageName(value);
}

type TierNameInput = {
  tierRank: TierRank;
  locale: TierLocale;
  name: string;
};
function parseTierNameInput(
  input: Record<string, unknown>,
): TierNameInput | null {
  const tierRank = parseInteger(input.tierRank, 1, 3);
  if (
    tierRank === null ||
    !TIER_LOCALE_SET.has(input.locale) ||
    !isTierName(input.name)
  )
    return null;
  return {
    tierRank: tierRank as TierRank,
    locale: input.locale as TierLocale,
    name: input.name,
  };
}

// FR-035 grants the global rename to the Platform Owner only; the wall
// precedes session creation and transport, mirroring the database wall.
export async function renamePlatformTierName(
  input: unknown,
): Promise<TierNameMutationResult> {
  try {
    const actor = await getActor();
    if (!actor || actor.deleted === true || actor.role !== 'platform_owner')
      return { status: 'denied' };
    const parsed = parseTierNameInput(inputRecord(input));
    if (!parsed) return { status: 'invalid_input' };
    const client = await createSessionClient();
    if (!client) return { status: 'unavailable' };
    const result = await client.rpc('set_package_tier_name', {
      tier_rank: parsed.tierRank,
      locale: parsed.locale,
      name: parsed.name,
    });
    if (result.error) return mapPackageError(result.error);
    return { status: 'ok' };
  } catch {
    return { status: 'unavailable' };
  }
}

// FR-035 permits the PO to override any workspace and a Workspace Owner to
// override only a workspace they own; other actors are denied before transport.
export async function setWorkspaceTierNameOverride(
  input: unknown,
): Promise<TierNameMutationResult> {
  try {
    const data = inputRecord(input);
    const actor = await getActor();
    if (
      !actor ||
      actor.deleted === true ||
      !isUuid(data.workspaceId) ||
      (actor.role !== 'platform_owner' &&
        (actor.role !== 'workspace_owner' ||
          !actor.activeWorkspaceIds.includes(data.workspaceId)))
    )
      return { status: 'denied' };
    const parsed = parseTierNameInput(data);
    if (!parsed) return { status: 'invalid_input' };
    const client = await createSessionClient();
    if (!client) return { status: 'unavailable' };
    const result = await client.rpc('set_package_tier_name_override', {
      workspace_id: data.workspaceId,
      tier_rank: parsed.tierRank,
      locale: parsed.locale,
      name: parsed.name,
    });
    if (result.error) return mapPackageError(result.error);
    return { status: 'ok' };
  } catch {
    return { status: 'unavailable' };
  }
}

// Resolved names under the FR-008 packages read scope: an override wins over
// the PO global rename, and any unset pair falls back to the PO-approved
// default label (FR-035/SC-025).
export async function loadWorkspaceTierNames(
  actor: Actor | null,
  workspaceId: string,
): Promise<TierNameReadResult> {
  if (
    !actor ||
    !isUuid(workspaceId) ||
    !authorize(actor, 'generate_registration_link', workspaceId)
  )
    return { status: 'denied' };
  try {
    const client = await createSessionClient();
    if (!client) return { status: 'unavailable' };
    const result = await client.rpc('get_package_tier_names', {
      workspace_id: workspaceId,
    });
    if (result.error) return mapPackageError(result.error);
    if (!Array.isArray(result.data)) return { status: 'unavailable' };
    const names: ResolvedTierName[] = [];
    for (const row of result.data as unknown[]) {
      if (!row || typeof row !== 'object') return { status: 'unavailable' };
      const record = row as Record<string, unknown>;
      if (
        !TIER_RANK_SET.has(record.tier_rank) ||
        !TIER_LOCALE_SET.has(record.locale) ||
        (record.name !== null && !isTierName(record.name))
      )
        return { status: 'unavailable' };
      const tierRank = record.tier_rank as TierRank;
      const locale = record.locale as TierLocale;
      const stored = record.name as string | null;
      names.push({
        tierRank,
        locale,
        name: stored === null ? tierLabel(tierRank, locale) : stored,
      });
    }
    return { status: 'ok', names };
  } catch {
    return { status: 'unavailable' };
  }
}

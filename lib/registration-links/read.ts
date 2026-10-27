import 'server-only';
import { authorize, type Actor } from '../auth/authorize';
import { createSessionClient } from '../supabase/server';
import { loadPackageOffers, type PackageVersion } from '../packages/read';
import { exactAmount, isUuid } from './validation';
import { registrationLinkStatus } from './grace';
import type { RegistrationFailure } from './results';
export const SAFE_LINK_COLUMNS =
  'workspace_id,id,package_version_id,created_by,created_at,expires_at,opened_at,consumed_at,price_minor,currency,duration_days,duration_months';
export const SAFE_INSTALLMENT_COLUMNS =
  'workspace_id,link_id,seq,amount_minor,due_offset_days';
export type LinkRow = {
  workspace_id: string;
  id: string;
  package_version_id: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  opened_at: string | null;
  consumed_at: string | null;
  price_minor: string;
  currency: string;
  duration_days: number;
  duration_months: number | null;
  commission_rate_bp?: number;
  status: ReturnType<typeof registrationLinkStatus>;
};
export type InstallmentRow = {
  workspace_id: string;
  link_id: string;
  seq: number;
  amount_minor: string;
  due_offset_days: number;
};
export type RegistrationData = {
  status: 'ok';
  offers: PackageVersion[];
  links: LinkRow[];
  installments: InstallmentRow[];
};
export async function loadRegistrationLinks(
  actor: Actor | null,
  workspaceId: string,
): Promise<RegistrationData | RegistrationFailure> {
  if (
    !actor ||
    !isUuid(workspaceId) ||
    !authorize(actor, 'generate_registration_link', workspaceId)
  )
    return { status: 'not_permitted' };
  try {
    const client = await createSessionClient();
    if (!client) return { status: 'unavailable' };
    const packages = await loadPackageOffers(actor, workspaceId);
    if (packages.status !== 'ok') return { status: 'unavailable' };
    const current = new Set(
      packages.offers
        .filter((o) => o.available)
        .map((o) => o.current_version_id),
    );
    const offers = packages.versions.filter((v) => current.has(v.id));
    const result = await client
      .from('registration_links_safe')
      .select(SAFE_LINK_COLUMNS)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(50);
    if (result.error || !result.data) return { status: 'unavailable' };
    const now = Date.now();
    let links: LinkRow[] = [];
    for (const r of result.data) {
      if (
        r.workspace_id !== workspaceId ||
        !isUuid(r.id) ||
        !exactAmount(r.price_minor)
      )
        return { status: 'unavailable' };
      links.push({
        workspace_id: r.workspace_id,
        id: r.id,
        package_version_id: r.package_version_id,
        created_by: r.created_by,
        created_at: r.created_at,
        expires_at: r.expires_at,
        opened_at: r.opened_at,
        consumed_at: r.consumed_at,
        price_minor: r.price_minor,
        currency: r.currency,
        duration_days: r.duration_days,
        duration_months: r.duration_months,
        status: registrationLinkStatus(
          {
            expiresAt: r.expires_at,
            openedAt: r.opened_at,
            consumedAt: r.consumed_at,
          },
          now,
        ),
      });
    }
    const installments: InstallmentRow[] = [];
    if (links.length) {
      const children = await client
        .from('registration_link_installments_safe')
        .select(SAFE_INSTALLMENT_COLUMNS)
        .eq('workspace_id', workspaceId)
        .in(
          'link_id',
          links.map((l) => l.id),
        )
        .order('seq');
      if (children.error || !children.data) return { status: 'unavailable' };
      const ids = new Set(links.map((l) => l.id));
      for (const r of children.data) {
        if (
          r.workspace_id !== workspaceId ||
          !ids.has(r.link_id) ||
          !exactAmount(r.amount_minor)
        )
          return { status: 'unavailable' };
        installments.push({
          workspace_id: r.workspace_id,
          link_id: r.link_id,
          seq: r.seq,
          amount_minor: r.amount_minor,
          due_offset_days: r.due_offset_days,
        });
      }
    }
    if (actor.role === 'platform_owner' || actor.role === 'workspace_owner') {
      const rates = await client.rpc('get_registration_link_commissions', {
        workspace_id: workspaceId,
      });
      if (rates.error || !Array.isArray(rates.data))
        return { status: 'unavailable' };
      const byId = new Map<string, number>(
        rates.data.map((r: { link_id: string; commission_rate_bp: number }) => [
          r.link_id,
          r.commission_rate_bp,
        ]),
      );
      if (links.some((l) => !byId.has(l.id))) return { status: 'unavailable' };
      links = links.map((l) => ({ ...l, commission_rate_bp: byId.get(l.id)! }));
    }
    return { status: 'ok', offers, links, installments };
  } catch {
    return { status: 'unavailable' };
  }
}

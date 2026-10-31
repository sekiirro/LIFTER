export type BrandingGcClaim = {
  id: string;
  workspace_id: string;
  bucket_id: string;
  object_name: string;
};

export type BrandingGcDependencies = {
  claim(batchSize: number): Promise<BrandingGcClaim[]>;
  remove(bucket: string, objectName: string): Promise<void>;
  finalize(claimId: string): Promise<boolean>;
};

function validClaim(claim: BrandingGcClaim): boolean {
  const validatedObject =
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\/validated\/(?:logo|banner)\/[0-9a-f]{64}(?:-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})?\.(?:png|webp)$/i;
  const stagingObject =
    /^([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\/staging\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i;
  const workspaceId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
    claim.workspace_id,
  );
  const staging = stagingObject.exec(claim.object_name);
  return (
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(claim.id) &&
    workspaceId &&
    ((claim.bucket_id === 'branding-validated' &&
      validatedObject.test(claim.object_name) &&
      claim.object_name.startsWith(`${claim.workspace_id}/`)) ||
      (claim.bucket_id === 'branding-staging' &&
        staging?.[1]?.toLowerCase() === claim.workspace_id.toLowerCase()))
  );
}

/** One bounded pass; an interrupted removal is retried after its DB lease expires. */
export async function runBrandingGc(
  dependencies: BrandingGcDependencies,
  batchSize = 10,
): Promise<number> {
  const claims = await dependencies.claim(
    Math.min(50, Math.max(1, Math.trunc(batchSize) || 10)),
  );
  let failed = false;
  for (const claim of claims) {
    try {
      if (!validClaim(claim)) throw new Error('branding_gc_invalid_claim');
      await dependencies.remove(claim.bucket_id, claim.object_name);
      const finalized = await dependencies.finalize(claim.id);
      if (!finalized) throw new Error('branding_gc_finalize_rejected');
    } catch {
      failed = true;
      console.error('branding_gc_claim_failed');
    }
  }
  if (failed) throw new Error('branding_gc_pass_failed');
  return claims.length;
}

export function createBrandingGc(env: {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}): BrandingGcDependencies {
  validateSupabaseUrl(env.SUPABASE_URL);
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  const rpc = async <T>(name: string, args: object): Promise<T> => {
    const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST',
      redirect: 'manual',
      headers,
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`branding_gc_rpc_${response.status}`);
    return response.json() as Promise<T>;
  };
  return {
    claim: (batchSize) => rpc('branding_gc_claim', { batch_size: batchSize }),
    async remove(bucket, objectName) {
      const response = await fetch(`${base}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        redirect: 'manual',
        headers,
        body: JSON.stringify({ prefixes: [objectName] }),
        signal: AbortSignal.timeout(30_000),
      });
      // Missing bytes are already in the desired state after an interrupted pass.
      if (!response.ok && response.status !== 404)
        throw new Error(`branding_gc_storage_${response.status}`);
    },
    async finalize(claimId) {
      const result = await rpc<boolean>('branding_gc_finalize', {
        claim_id: claimId,
      });
      return result;
    },
  };
}
import { validateSupabaseUrl } from './rpc';

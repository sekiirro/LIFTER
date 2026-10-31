import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));

describe('F14b upload action contract', () => {
  it('exposes stable upload/remove signatures and sanitized codes', () => {
    const contract = readFileSync(
      resolve(root, 'lib/branding/client-contract.ts'),
      'utf8',
    );
    expect(contract).toContain(
      "export type BrandingAssetRole = 'logo' | 'banner'",
    );
    for (const code of [
      'invalid_type',
      'too_large',
      'bad_dimensions',
      'stale_revision',
      'forbidden',
      'interrupted',
      'server_error',
    ])
      expect(contract).toContain(`'${code}'`);
    expect(contract).toContain('identityOnlyConfirmed: boolean');
    expect(contract).toContain('newRevision: number');
    expect(contract).toContain('thumbnailUrl: string | null');
  });

  it('binds upload and removal to manage_branding and the expected draft revision', () => {
    const actions = readFileSync(
      resolve(root, 'app/(dashboard)/branding/upload-actions.ts'),
      'utf8',
    );
    const migration = readFileSync(
      resolve(
        root,
        'supabase/migrations/20261105120000_branding_upload_application_seam.sql',
      ),
      'utf8',
    );
    expect(actions).toMatch(
      /authorize\(actor,\s*'manage_branding',\s*workspaceId\)/,
    );
    expect(actions).toMatch(
      /authorize\(actor,\s*'manage_branding',\s*workspaceId\)/,
    );
    const service = readFileSync(
      resolve(root, 'lib/branding/upload-service.ts'),
      'utf8',
    );
    expect(service).toMatch(/beginUpload\([\s\S]*?input\.expectedRevision,/);
    expect(service).toMatch(/attach\([\s\S]*?input\.expectedRevision,/);
    expect(actions).toMatch(/branding_asset_detach/);
    expect(migration).toMatch(
      /has_workspace_access\(workspace_id,'manage_branding'\)/,
    );
    expect(migration).toMatch(/d\.revision\s*<>\s*expected_revision/);
  });

  it('requires confirmation only for banners and never calls publication', () => {
    const actions = readFileSync(
      resolve(root, 'app/(dashboard)/branding/upload-actions.ts'),
      'utf8',
    );
    expect(actions).toMatch(
      /assetRole === 'banner'.*identityOnlyConfirmed !== true/s,
    );
    expect(actions).not.toMatch(/branding_publish/);
  });

  it('exports draft preview types and keeps the thumbnail route owner scoped', () => {
    const contract = readFileSync(
      resolve(root, 'lib/branding/client-contract.ts'),
      'utf8',
    );
    expect(contract).toContain('export type BrandingDraftReadContract');
    expect(contract).toContain('export type BrandingDraftPreviewHandle');
    const route = readFileSync(
      resolve(root, 'app/api/branding/draft-image/route.ts'),
      'utf8',
    );
    expect(route).toMatch(
      /authorize\(actor,\s*'manage_branding',\s*workspaceId\)/,
    );
    expect(route).toContain("client.rpc('branding_draft_read'");
    expect(route).toContain(".from('branding-validated')");
    expect(route).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});

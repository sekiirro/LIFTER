import { NextResponse } from 'next/server';
import { authorize } from '../../../../lib/auth/authorize';
import { loadActorRows } from '../../../../lib/auth/actor';
import { createSessionClient } from '../../../../lib/supabase/server';
import { isUuid } from '../../../../lib/registration-links/validation';
import { BRANDING_IMAGE_LIMITS } from '../../../../lib/branding/image-validation';

export const runtime = 'nodejs';

const unavailable = () =>
  new NextResponse(null, {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspace');
  const role = url.searchParams.get('role');
  if (
    !workspaceId ||
    !isUuid(workspaceId) ||
    (role !== 'logo' && role !== 'banner')
  )
    return unavailable();
  const client = await createSessionClient();
  if (!client) return unavailable();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return unavailable();
  const actor = await loadActorRows(client, auth.user.id);
  if (!actor || !authorize(actor, 'manage_branding', workspaceId))
    return unavailable();
  try {
    const { data, error } = await client.rpc('branding_draft_read', {
      workspace_id: workspaceId,
    });
    if (error || !data?.fields?.[role]) return unavailable();
    const asset = data.fields[role] as {
      bucket?: string;
      object?: string;
      content_type?: string;
      byte_size?: number;
    };
    const match = new RegExp(
      `^${workspaceId}/validated/${role}/[0-9a-f]{64}(?:-[0-9a-f-]{36})?\\.(png|webp)$`,
      'i',
    );
    if (
      asset.bucket !== 'branding-validated' ||
      typeof asset.object !== 'string' ||
      !match.test(asset.object)
    )
      return unavailable();
    const maxBytes = BRANDING_IMAGE_LIMITS[role].maxOutputBytes;
    if (
      !Number.isSafeInteger(asset.byte_size) ||
      asset.byte_size! < 1 ||
      asset.byte_size! > maxBytes
    )
      return unavailable();
    const downloaded = await client.storage
      .from('branding-validated')
      .download(asset.object);
    if (
      downloaded.error ||
      !downloaded.data ||
      downloaded.data.size !== asset.byte_size
    )
      return unavailable();
    const contentType =
      asset.content_type === 'image/png' || asset.content_type === 'image/webp'
        ? asset.content_type
        : null;
    if (
      !contentType ||
      !asset.object
        .toLowerCase()
        .endsWith(contentType === 'image/png' ? '.png' : '.webp')
    )
      return unavailable();
    return new NextResponse(downloaded.data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(asset.byte_size),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        Vary: 'Cookie',
      },
    });
  } catch {
    return unavailable();
  }
}

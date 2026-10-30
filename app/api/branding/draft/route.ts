import { NextResponse } from 'next/server';
import { authorize } from '../../../../lib/auth/authorize';
import { loadActorRows } from '../../../../lib/auth/actor';
import { createSupabaseBrandingRepository } from '../../../../lib/branding/repository';
import { createSessionClient } from '../../../../lib/supabase/server';
import { isUuid } from '../../../../lib/registration-links/validation';

export async function GET(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get('workspace');
  if (!workspaceId || !isUuid(workspaceId))
    return NextResponse.json({ status: 'unavailable' }, { status: 404 });
  const client = await createSessionClient();
  if (!client)
    return NextResponse.json({ status: 'unavailable' }, { status: 401 });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user)
    return NextResponse.json({ status: 'unavailable' }, { status: 401 });
  const actor = await loadActorRows(client, data.user.id);
  if (!actor || !authorize(actor, 'manage_branding', workspaceId)) {
    return NextResponse.json({ status: 'unavailable' }, { status: 404 });
  }
  let draft;
  try {
    draft = await createSupabaseBrandingRepository(
      client,
      request.signal,
    ).getDraft(workspaceId);
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 404 });
  }
  return NextResponse.json(draft, {
    headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' },
  });
}

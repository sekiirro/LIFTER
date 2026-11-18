import { NextResponse } from 'next/server';
import { authorize } from '../../../../lib/auth/authorize';
import { loadActorRows } from '../../../../lib/auth/actor';
import { createSupabaseBrandingRepository } from '../../../../lib/branding/repository';
import { createSessionClient } from '../../../../lib/supabase/server';
import { isUuid } from '../../../../lib/registration-links/validation';

// Q-M16: every draft response, including denials and errors, is private and
// non-cacheable. Keep this directive in one place so error paths cannot drift.
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' };

function unavailable(status: number) {
  return NextResponse.json(
    { status: 'unavailable' },
    { status, headers: PRIVATE_HEADERS },
  );
}

export async function GET(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get('workspace');
  if (!workspaceId || !isUuid(workspaceId)) return unavailable(404);
  const client = await createSessionClient();
  if (!client) return unavailable(401);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return unavailable(401);
  const actor = await loadActorRows(client, data.user.id);
  if (!actor || !authorize(actor, 'manage_branding', workspaceId)) {
    return unavailable(404);
  }
  let draft;
  try {
    draft = await createSupabaseBrandingRepository(
      client,
      request.signal,
    ).getDraft(workspaceId);
  } catch {
    return unavailable(404);
  }
  return NextResponse.json(draft, {
    headers: { ...PRIVATE_HEADERS, Vary: 'Cookie' },
  });
}

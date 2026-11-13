import { NextResponse, type NextRequest } from 'next/server';
import { unlinkTelegram } from '../../../../../lib/forms/telegram-link';
import { requestUsesHttps } from '../../../../../lib/forms/privacy-contract';
import { createSessionClient } from '../../../../../lib/supabase/server';

export async function POST(request: NextRequest) {
  if (!requestUsesHttps(request))
    return NextResponse.json({ status: 'not_found' }, { status: 404 });
  const client = await createSessionClient();
  const { data } = client
    ? await client.auth.getUser()
    : { data: { user: null } };
  if (!client || !data.user)
    return NextResponse.json({ status: 'not_found' }, { status: 404 });
  return NextResponse.json(
    { status: (await unlinkTelegram(client)) ? 'ok' : 'unavailable' },
    { headers: { 'cache-control': 'no-store' } },
  );
}

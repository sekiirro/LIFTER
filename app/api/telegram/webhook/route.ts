import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import {
  parseTelegramStart,
  validTelegramWebhookSecret,
} from '../../../../lib/forms/telegram-webhook';

export async function POST(request: NextRequest) {
  if (
    !validTelegramWebhookSecret(
      request.headers.get('x-telegram-bot-api-secret-token'),
      process.env.TELEGRAM_WEBHOOK_SECRET,
    )
  )
    return NextResponse.json({ status: 'not_found' }, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: 'invalid' }, { status: 400 });
  }
  const start = parseTelegramStart(body);
  if (!start) return NextResponse.json({ status: 'ignored' }, { status: 200 });
  const client = createAdminClient();
  if (!client)
    return NextResponse.json({ status: 'unavailable' }, { status: 503 });
  const { data, error } = await client.rpc('consume_f15_telegram_start', {
    p_update_id: start.updateId,
    p_token: start.token,
    p_chat_id: start.chatId,
  });
  if (error)
    return NextResponse.json({ status: 'unavailable' }, { status: 503 });
  return NextResponse.json(
    { status: data ? 'linked' : 'invalid' },
    { status: data ? 200 : 404 },
  );
}

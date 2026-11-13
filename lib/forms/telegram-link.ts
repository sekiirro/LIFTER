import type { SupabaseClient } from '@supabase/supabase-js';

export async function createTelegramLink(client: SupabaseClient) {
  const { data, error } = await client.rpc('create_f15_telegram_link_token');
  if (error || typeof data !== 'string' || !/^[a-f0-9]{64}$/.test(data))
    return null;
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  if (!bot || !/^[A-Za-z0-9_]{5,32}$/.test(bot)) return null;
  return `https://t.me/${bot}?start=${data}`;
}

export async function unlinkTelegram(client: SupabaseClient) {
  const { data, error } = await client.rpc('unlink_f15_telegram');
  return !error && data === true;
}

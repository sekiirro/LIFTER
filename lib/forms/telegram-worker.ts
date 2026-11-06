import 'server-only';
import { createAdminClient } from '../supabase/admin';
import { runTelegramJobs, telegramHttpTransport } from './telegram-delivery';

export async function processTelegramAlertJobs() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.APP_URL;
  const client = createAdminClient();
  if (!token || !appUrl || !client) return { completed: 0, failed: 0 };
  return runTelegramJobs({
    client,
    transport: telegramHttpTransport(token),
    appUrl,
  });
}

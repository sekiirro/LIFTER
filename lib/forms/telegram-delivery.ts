export type TelegramMessage = { chatId: string; text: string };

export function buildTelegramMessage(input: {
  chatId: string;
  alertId: string;
  appUrl: string;
}): TelegramMessage | null {
  let url: URL;
  try {
    url = new URL(input.appUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !/^[0-9a-f-]{36}$/i.test(input.alertId))
    return null;
  return {
    chatId: input.chatId,
    text: `You have a new form alert. Open your in-app inbox: ${new URL('/forms/alerts', url).toString()}`,
  };
}

export interface TelegramTransport {
  send(message: TelegramMessage): Promise<void>;
}

export async function deliverTelegramAlert(input: {
  message: TelegramMessage;
  transport: TelegramTransport;
}) {
  await input.transport.send(input.message);
}

export interface TelegramJobClient {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

type ClaimedJob = {
  id: string;
  lease_token: string;
  kind: string;
  payload: unknown;
};

export async function runTelegramJobs(input: {
  client: TelegramJobClient;
  transport: TelegramTransport;
  appUrl: string;
}) {
  const claimed = await input.client.rpc('claim_f15_form_alert_jobs', {
    p_batch: 25,
    p_lease_seconds: 300,
  });
  if (claimed.error || !Array.isArray(claimed.data))
    return { completed: 0, failed: 0 };
  let completed = 0;
  let failed = 0;
  for (const raw of claimed.data) {
    const job = raw as Partial<ClaimedJob>;
    const payload = job.payload as Record<string, unknown> | null;
    const alertId = payload?.alert_id;
    const recipientId = payload?.recipient_id;
    if (
      job.kind !== 'forms.alert' ||
      typeof job.id !== 'string' ||
      typeof job.lease_token !== 'string' ||
      typeof alertId !== 'string' ||
      typeof recipientId !== 'string'
    ) {
      await input.client.rpc('jobs_fail', {
        id: job.id,
        lease: job.lease_token,
        error_code: 'invalid_payload',
        permanent: true,
      });
      failed++;
      continue;
    }
    const prepared = await input.client.rpc('prepare_f15_telegram_delivery', {
      p_alert_id: alertId,
      p_recipient_id: recipientId,
    });
    const context = prepared.data as Record<string, unknown> | null;
    if (prepared.error || !context || context.status === 'unavailable') {
      await input.client.rpc('jobs_fail', {
        id: job.id,
        lease: job.lease_token,
        error_code: 'authorization_changed',
        permanent: true,
      });
      failed++;
      continue;
    }
    if (context.status !== 'ready') {
      await input.client.rpc('jobs_complete', {
        id: job.id,
        lease: job.lease_token,
      });
      completed++;
      continue;
    }
    const claimedDelivery = await input.client.rpc(
      'claim_f15_telegram_delivery',
      {
        p_delivery_id: context.delivery_id,
      },
    );
    if (claimedDelivery.error || typeof claimedDelivery.data !== 'string') {
      await input.client.rpc('jobs_complete', {
        id: job.id,
        lease: job.lease_token,
      });
      completed++;
      continue;
    }
    const message = buildTelegramMessage({
      chatId: claimedDelivery.data,
      alertId,
      appUrl: input.appUrl,
    });
    if (!message) {
      await input.client.rpc('jobs_fail', {
        id: job.id,
        lease: job.lease_token,
        error_code: 'invalid_message',
        permanent: true,
      });
      failed++;
      continue;
    }
    try {
      await deliverTelegramAlert({ message, transport: input.transport });
      const finished = await input.client.rpc('finish_f15_telegram_delivery', {
        p_delivery_id: context.delivery_id,
        p_status: 'delivered',
      });
      if (finished.error || finished.data !== true) {
        await input.client.rpc('jobs_fail', {
          id: job.id,
          lease: job.lease_token,
          error_code: 'delivery_state_unavailable',
          permanent: false,
        });
        failed++;
        continue;
      }
      await input.client.rpc('jobs_complete', {
        id: job.id,
        lease: job.lease_token,
      });
      completed++;
    } catch {
      const failure = await input.client.rpc('jobs_fail', {
        id: job.id,
        lease: job.lease_token,
        error_code: 'telegram_transport',
        permanent: false,
      });
      if (failure.data === 'dead' || failure.data === 'pending') {
        await input.client.rpc('finish_f15_telegram_delivery', {
          p_delivery_id: context.delivery_id,
          p_status: failure.data === 'dead' ? 'dead' : 'queued',
        });
      }
      failed++;
    }
  }
  return { completed, failed };
}

export function telegramHttpTransport(token: string): TelegramTransport {
  return {
    async send(message) {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: message.chatId,
            text: message.text,
            disable_web_page_preview: true,
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) throw new Error('telegram_transport');
      const result = (await response.json()) as { ok?: unknown };
      if (result.ok !== true) throw new Error('telegram_transport');
    },
  };
}

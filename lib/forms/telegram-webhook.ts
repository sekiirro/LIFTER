import { timingSafeEqual } from 'node:crypto';

export function validTelegramWebhookSecret(
  supplied: string | null,
  configured: string | undefined,
) {
  if (!supplied || !configured) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(configured);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function validTelegramWorkerSecret(
  authorization: string | null,
  configured: string | undefined,
) {
  if (!authorization?.startsWith('Bearer ') || !configured) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(configured);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export function parseTelegramStart(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const payload = body as Record<string, unknown>;
  const updateId = payload.update_id;
  const message = payload.message;
  if (!message || typeof message !== 'object') return null;
  const record = message as Record<string, unknown>;
  const from = record.from;
  const chat = record.chat;
  if (!from || typeof from !== 'object' || !chat || typeof chat !== 'object')
    return null;
  const sender = from as Record<string, unknown>;
  const chatRecord = chat as Record<string, unknown>;
  const text = record.text;
  if (
    typeof updateId !== 'number' ||
    !Number.isSafeInteger(updateId) ||
    updateId < 0 ||
    typeof text !== 'string' ||
    !text.startsWith('/start ') ||
    typeof sender.id !== 'number' ||
    typeof chatRecord.id !== 'number' ||
    sender.id !== chatRecord.id
  )
    return null;
  const token = text.slice(7).trim();
  return /^[a-f0-9]{64}$/.test(token)
    ? { token, chatId: String(chatRecord.id), updateId }
    : null;
}

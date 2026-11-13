import { NextResponse, type NextRequest } from 'next/server';
import { processTelegramAlertJobs } from '../../../../../lib/forms/telegram-worker';
import { validTelegramWorkerSecret } from '../../../../../lib/forms/telegram-webhook';
import {
  formsPrivateNoStoreHeaders,
  requestUsesHttps,
} from '../../../../../lib/forms/privacy-contract';

export async function POST(request: NextRequest) {
  if (
    !requestUsesHttps(request) ||
    !validTelegramWorkerSecret(
      request.headers.get('authorization'),
      process.env.TELEGRAM_WORKER_SECRET,
    )
  )
    return NextResponse.json(
      { status: 'not_found' },
      { status: 404, headers: formsPrivateNoStoreHeaders() },
    );
  const result = await processTelegramAlertJobs();
  return NextResponse.json(
    { status: 'ok', ...result },
    { headers: formsPrivateNoStoreHeaders() },
  );
}

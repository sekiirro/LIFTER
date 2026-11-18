import { NextResponse, type NextRequest } from 'next/server';
import {
  formsPrivateNoStoreHeaders,
  requestUsesHttps,
} from '../../forms/privacy-contract';
import type { FoodReplacementResult } from './validation';

/** Closed mapping from outcome code to HTTP status; no database text is exposed. */
export function httpStatusFor(result: FoodReplacementResult): number {
  switch (result.status) {
    case 'created':
      return 201;
    case 'ok':
    case 'selected':
    case 'cancelled':
    case 'rejected':
    case 'prepared':
      return 200;
    case 'invalid':
      return 400;
    case 'denied':
      return 404;
    case 'invalid_replace':
    case 'invalid_alternative':
    case 'invalid_selection':
      return 422;
    case 'unavailable':
      return 503;
    default:
      // already_open, not_open, already_prepared, stale_version, key_conflict,
      // target_missing, cap_reached
      return 409;
  }
}

/**
 * Shared POST handler: HTTPS only, JSON body, no-store private headers, and a
 * closed response body (`status` plus the ids the operation returns).
 */
export async function handleFoodReplacementPost(
  request: NextRequest,
  operation: (body: unknown) => Promise<FoodReplacementResult>,
): Promise<NextResponse> {
  const respond = (body: unknown, status: number) =>
    NextResponse.json(body, {
      status,
      headers: formsPrivateNoStoreHeaders(),
    });
  if (!requestUsesHttps(request))
    return respond({ status: 'unavailable' }, 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({ status: 'invalid' }, 400);
  }
  try {
    const result = await operation(body);
    return respond(result, httpStatusFor(result));
  } catch {
    return respond({ status: 'unavailable' }, 503);
  }
}

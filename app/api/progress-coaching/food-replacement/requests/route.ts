import { type NextRequest } from 'next/server';
import { handleFoodReplacementPost } from '../../../../../lib/progress-coaching/food-replacement/http';
import {
  cancelFoodReplacementRequest,
  submitFoodReplacementRequest,
} from '../../../../../lib/progress-coaching/food-replacement/requests';

/**
 * Client request operations. Body: `{ action: 'submit', planVersionId, itemId,
 * requestText }` or `{ action: 'cancel', requestId }`. Workspace and client are
 * never accepted from the body; the database derives them from the session.
 */
export async function POST(request: NextRequest) {
  return handleFoodReplacementPost(request, async (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return { status: 'invalid' };
    const { action, ...rest } = body as Record<string, unknown>;
    if (action === 'submit') return submitFoodReplacementRequest(rest);
    if (action === 'cancel') return cancelFoodReplacementRequest(rest);
    return { status: 'invalid' };
  });
}

import { type NextRequest } from 'next/server';
import { handleFoodReplacementPost } from '../../../../../lib/progress-coaching/food-replacement/http';
import { approveFoodReplacementRequest } from '../../../../../lib/progress-coaching/food-replacement/approval';

export async function POST(request: NextRequest) {
  return handleFoodReplacementPost(request, approveFoodReplacementRequest);
}

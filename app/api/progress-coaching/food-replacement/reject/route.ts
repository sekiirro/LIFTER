import { type NextRequest } from 'next/server';
import { handleFoodReplacementPost } from '../../../../../lib/progress-coaching/food-replacement/http';
import { rejectFoodReplacementRequest } from '../../../../../lib/progress-coaching/food-replacement/lifecycle';

export async function POST(request: NextRequest) {
  return handleFoodReplacementPost(request, rejectFoodReplacementRequest);
}

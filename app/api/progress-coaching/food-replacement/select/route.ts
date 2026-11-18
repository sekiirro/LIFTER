import { type NextRequest } from 'next/server';
import { handleFoodReplacementPost } from '../../../../../lib/progress-coaching/food-replacement/http';
import { selectExistingAlternative } from '../../../../../lib/progress-coaching/food-replacement/selection';

export async function POST(request: NextRequest) {
  return handleFoodReplacementPost(request, selectExistingAlternative);
}

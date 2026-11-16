'use server';

import { requireActor } from '../../../lib/auth/actor';
import { publishWorkoutPlan } from '../../../lib/plans/publish';
import { createSessionClient } from '../../../lib/supabase/server';

export async function publishWorkoutPlanAction(input: unknown) {
  const [actor, client] = await Promise.all([
    requireActor(),
    createSessionClient(),
  ]);
  if (!client) return { status: 'not_permitted' as const };
  return publishWorkoutPlan(input, { actor, client });
}

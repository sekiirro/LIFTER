'use server';

import { requireActor } from '../../../lib/auth/actor';
import { createWorkoutPlan } from '../../../lib/plans/create';
import { createSessionClient } from '../../../lib/supabase/server';

export async function createWorkoutPlanAction(input: unknown) {
  const [actor, client] = await Promise.all([
    requireActor(),
    createSessionClient(),
  ]);
  if (!client) return { status: 'not_permitted' as const };
  return createWorkoutPlan(input, { actor, client });
}

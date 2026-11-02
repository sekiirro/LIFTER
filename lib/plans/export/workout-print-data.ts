import type { Actor } from '../../auth/authorize';
import type { PublishedWorkoutVersionApiResponse } from './excel';

export type PublishedWorkoutVersionIdentifier = Readonly<{
  planId: string;
  version: number;
}>;

export interface PublishedWorkoutVersionLoader {
  loadPublishedVersion(
    actor: Actor,
    identifier: PublishedWorkoutVersionIdentifier,
  ): Promise<PublishedWorkoutVersionApiResponse | null>;
}

/** Accepts only the exact immutable published version requested by the route. */
export async function selectPublishedWorkoutVersion(
  loader: PublishedWorkoutVersionLoader,
  actor: Actor,
  identifier: PublishedWorkoutVersionIdentifier,
): Promise<PublishedWorkoutVersionApiResponse | null> {
  if (
    !identifier.planId.trim() ||
    !Number.isSafeInteger(identifier.version) ||
    identifier.version < 1
  ) {
    return null;
  }
  const response = await loader.loadPublishedVersion(actor, identifier);
  if (
    !response ||
    response.status !== 'published' ||
    response.planId !== identifier.planId ||
    response.version !== identifier.version
  ) {
    return null;
  }
  return response;
}

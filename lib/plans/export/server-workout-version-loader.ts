import type { Actor } from '../../auth/authorize';
import type { PublishedWorkoutVersionApiResponse } from './excel';
import type {
  PublishedWorkoutVersionIdentifier,
  PublishedWorkoutVersionLoader,
} from './workout-print-data';

/**
 * F17 has no published-version read API on this branch yet. Keep the route
 * behind this typed server boundary until its authorized API adapter lands.
 */
export const serverWorkoutVersionLoader: PublishedWorkoutVersionLoader = {
  async loadPublishedVersion(
    actor: Actor,
    identifier: PublishedWorkoutVersionIdentifier,
  ): Promise<PublishedWorkoutVersionApiResponse | null> {
    void actor;
    void identifier;
    return null;
  },
};

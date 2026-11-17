import { describe, expect, it } from 'vitest';
import { freezeWorkoutExercise } from '../../lib/workout-planner/exercise-resolution';
import { currentWorkoutVideo } from '../../lib/workout-planner/live-video';

const reference = {
  source: 'global' as const,
  identity_id: '00000000-0000-4000-8000-000000000001',
  version: 1,
};

describe('T035 live Video resolution', () => {
  it('resolves the current global projection each time and never freezes its URL', () => {
    const first = currentWorkoutVideo(reference, {
      variation: { video_url: 'https://youtu.be/current-one' },
    });
    const second = currentWorkoutVideo(reference, {
      variation: { video_url: 'https://youtu.be/current-two' },
    });

    expect(first).toBe('https://youtu.be/current-one');
    expect(second).toBe('https://youtu.be/current-two');
    const revisionEntry = freezeWorkoutExercise(reference, {
      name: 'Row',
      alternatives: [],
      sets: [],
    });
    expect(revisionEntry).not.toHaveProperty('video');
    expect(revisionEntry).not.toHaveProperty('videoUrl');
    expect(JSON.stringify(revisionEntry)).not.toContain('youtu.be');
  });

  it('uses the workspace-private current projection and omits missing Video', () => {
    const privateReference = {
      source: 'workspace_private' as const,
      identity_id: '00000000-0000-4000-8000-000000000002',
      version: 1,
      workspace_id: '00000000-0000-4000-8000-000000000003',
    };

    expect(
      currentWorkoutVideo(privateReference, {
        payload: { video_url: 'https://youtu.be/private-current' },
      }),
    ).toBe('https://youtu.be/private-current');
    expect(
      currentWorkoutVideo(privateReference, { payload: { video_url: null } }),
    ).toBeUndefined();
  });
});

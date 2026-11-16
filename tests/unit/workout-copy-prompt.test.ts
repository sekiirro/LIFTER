import { describe, expect, it } from 'vitest';
import {
  canCopyWorkoutPrompt,
  formatWorkoutPromptContent,
  type WorkoutPromptActor,
} from '../../lib/workout-planner/copy-prompt';
import type { WorkoutExportPayload } from '../../lib/workout-planner/export-payload';
import { getMessages } from '../../lib/i18n';

const payload: WorkoutExportPayload = {
  planTitle: 'Workout plan',
  planIdentity: 'Revision 4',
  planNotes: 'Deload week',
  documentNotes: 'Keep the schedule flexible',
  days: [
    {
      kind: 'session',
      title: 'Push day',
      notes: 'Coach day note',
      items: [
        {
          name: 'Bench Press',
          description: 'Barbell on bench',
          reps: { min: 8, max: 12 },
          restSec: 90,
          rir: 1,
          notes: 'Keep elbows tucked',
          alternatives: [
            {
              name: 'Dumbbell Press',
              videoUrl: 'https://video.example/alternative',
            },
          ],
          videoUrl: 'https://video.example/bench',
          sets: [
            { type: 'warmup', load: { mode: 'bodyweight' } },
            {
              type: 'working',
              load: { mode: 'added_weight', value: '60', unit: 'kg' },
            },
          ],
        },
      ],
    },
    { kind: 'rest', title: 'Rest day', items: [] },
  ],
};

const actor: WorkoutPromptActor = {
  role: 'trainer',
  activeWorkspaceIds: ['workspace-a'],
};

describe('F17 Copy AI Prompt action (T040, FR-019, SC-009)', () => {
  it('allows export-authorized staff only in the plan workspace', () => {
    expect(canCopyWorkoutPrompt(actor, 'workspace-a')).toBe(true);
    expect(
      canCopyWorkoutPrompt({ ...actor, role: 'platform_owner' }, 'workspace-a'),
    ).toBe(true);
    expect(
      canCopyWorkoutPrompt(
        { ...actor, role: 'workspace_owner' },
        'workspace-a',
      ),
    ).toBe(true);
    expect(
      canCopyWorkoutPrompt({ ...actor, role: 'sales' }, 'workspace-a'),
    ).toBe(false);
    expect(canCopyWorkoutPrompt(actor, 'workspace-b')).toBe(false);
    expect(canCopyWorkoutPrompt({ ...actor, role: null }, 'workspace-a')).toBe(
      false,
    );
  });

  it('uses the approved action and copied confirmation strings per locale', () => {
    expect(getMessages('en')['workout.copyPrompt.action']).toBe(
      'Copy AI Prompt',
    );
    expect(getMessages('en')['workout.copyPrompt.copied']).toBe('Copied.');
    expect(getMessages('ar')['workout.copyPrompt.action']).toBe(
      'نسخ برومبت الذكاء الاصطناعي',
    );
    expect(getMessages('ar')['workout.copyPrompt.copied']).toBe('تم النسخ.');
  });

  it('serializes the complete published export payload without dropping authored data', () => {
    const content = formatWorkoutPromptContent(payload, 'en');
    for (const value of [
      'Deload week',
      'Keep the schedule flexible',
      'Push day',
      'Coach day note',
      'Bench Press',
      'Barbell on bench',
      '8-12',
      '60 kg',
      'Rest (sec): 90',
      'RIR: 1',
      'Keep elbows tucked',
      'Dumbbell Press',
      'https://video.example/alternative',
      'https://video.example/bench',
      'Rest day',
    ]) {
      expect(content).toContain(value);
    }
    expect(content).not.toContain('Coach-original');
  });
});

import { describe, expect, it } from 'vitest';
import { copyWorkoutDocument } from '../../lib/workout-planner/copy';

const uuid = (tail: string) =>
  `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
const source = {
  schema_version: 1 as const,
  notes: 'plan note',
  days: [
    {
      id: uuid('1'),
      kind: 'session' as const,
      items: [
        {
          id: uuid('2'),
          exercise: {
            source: 'global' as const,
            identity_id: uuid('3'),
            version: 4,
            overrideVersion: 2,
            overrideWorkspaceId: uuid('4'),
          },
          name: 'Press',
          description: 'source description',
          reps: { value: 8 },
          restSec: 0,
          rir: 0,
          notes: 'entry note',
          alternatives: [
            {
              source: 'workspace_private' as const,
              identity_id: uuid('5'),
              version: 1,
              workspace_id: uuid('4'),
            },
          ],
          sets: [
            {
              id: uuid('6'),
              type: 'working' as const,
              load: {
                mode: 'assisted' as const,
                value: '2.50',
                unit: 'lb' as const,
              },
            },
          ],
        },
      ],
    },
  ],
};

describe('F17 source-preserving load/copy (T005)', () => {
  it('preserves entry values, set loads and 0 RIR without reading defaults', () => {
    const ids = [uuid('11'), uuid('12'), uuid('13')];
    const copy = copyWorkoutDocument(source, () => ids.shift()!);
    expect(copy.days[0]!.items[0]!).toMatchObject({
      exercise: source.days[0]!.items[0]!.exercise,
      name: 'Press',
      description: 'source description',
      reps: { value: 8 },
      restSec: 0,
      rir: 0,
      notes: 'entry note',
      alternatives: source.days[0]!.items[0]!.alternatives,
      sets: [
        {
          type: 'working',
          load: { mode: 'assisted', value: '2.50', unit: 'lb' },
        },
      ],
    });
    expect([
      copy.days[0]!.id,
      copy.days[0]!.items[0]!.id,
      copy.days[0]!.items[0]!.sets[0]!.id,
    ]).not.toEqual([
      source.days[0]!.id,
      source.days[0]!.items[0]!.id,
      source.days[0]!.items[0]!.sets[0]!.id,
    ]);
    expect(copy.days[0]!.items[0]!.rir).toBe(0);
  });

  it('creates a destination-independent copy', () => {
    const ids = [uuid('11'), uuid('12'), uuid('13')];
    const copy = copyWorkoutDocument(source, () => ids.shift()!);
    (copy.days[0]!.items[0]!.sets[0]!.load as { value: string }).value = '9';
    (
      copy.days[0]!.items[0]!.alternatives as { workspace_id: string }[]
    )[0]!.workspace_id = uuid('7');
    expect(
      (source.days[0]!.items[0]!.sets[0]!.load as { value: string }).value,
    ).toBe('2.50');
    expect(source.days[0]!.items[0]!.alternatives[0]!.workspace_id).toBe(
      uuid('4'),
    );
  });
});

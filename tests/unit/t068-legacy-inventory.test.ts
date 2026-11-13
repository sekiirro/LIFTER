import { describe, expect, it } from 'vitest';
import {
  summarizeInventory,
  serializeInventoryReport,
  readInventory,
} from '../../scripts/f16/t068-legacy-inventory.mjs';

describe('T068 legacy inventory output', () => {
  it('reads inventory and cutover identities in one repeatable-read snapshot', async () => {
    const queries: string[] = [];
    type FakeRow = Record<string, unknown>;
    type FakeQuery = (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => Promise<FakeRow[]>;
    const tx: FakeQuery = async (strings) => {
      const query = strings.join('?');
      queries.push(query);
      if (query.includes('from public.exercises'))
        return [{ id: 'exercise-1', lifecycle_state: 'active' }];
      if (query.includes('from public.exercise_versions'))
        return [{ exercise_id: 'exercise-1', version: 2, payload: {} }];
      if (query.includes('from public.workspace_exercises'))
        return [{ workspace_id: 'workspace-1', id: 'private-1' }];
      if (query.includes('from public.workspace_exercise_versions'))
        return [
          {
            workspace_id: 'workspace-1',
            workspace_exercise_id: 'private-1',
            version: 3,
            payload: {},
          },
        ];
      return [];
    };
    const db = {
      begin: (body: (query: FakeQuery) => Promise<unknown>) => body(tx),
    };
    const result = await readInventory(db, { includeIdentitySet: true });
    expect(queries[0]).toContain(
      'set transaction isolation level repeatable read, read only',
    );
    expect(
      queries.filter((query) => query.includes('from public.exercises')),
    ).toHaveLength(1);
    expect(
      queries.filter((query) =>
        query.includes('from public.workspace_exercises'),
      ),
    ).toHaveLength(1);
    expect(result.identitySet).toEqual({
      exercises: ['exercise-1'],
      workspace_exercises: [['workspace-1', 'private-1']],
      exercise_versions: [['exercise-1', 2]],
      workspace_exercise_versions: [['workspace-1', 'private-1', 3]],
    });
  });

  it('emits counts only when fake rows contain notes, URLs, or payload text', () => {
    const privateNote = 'PRIVATE_NOTE_SENTINEL_4f2c';
    const privateUrl =
      'https://www.youtube.com/watch?v=PRIVATE_URL_SENTINEL_4f2c';
    const privateName = 'PRIVATE_PAYLOAD_SENTINEL_4f2c';
    const report = summarizeInventory({
      workspaces: [{ id: 'workspace-1' }, { id: 'workspace-2' }],
      variations: [
        {
          workspace_id: 'workspace-1',
          exercise_id: 'exercise-1',
          current_version: 1,
          lifecycle_state: 'active',
        },
      ],
      variationVersions: [
        {
          workspace_id: 'workspace-1',
          exercise_id: 'exercise-1',
          version: 1,
          payload: { note: privateNote, video_url: privateUrl },
        },
      ],
      exercises: [{ id: 'exercise-1', lifecycle_state: 'active' }],
      workspaceExercises: [],
      exerciseVersions: [
        {
          exercise_id: 'exercise-1',
          version: 1,
          payload: {
            name_en: privateName,
            instructions_en: privateNote,
            video_url: privateUrl,
          },
        },
      ],
      workspaceExerciseVersions: [],
    });

    const serialized = serializeInventoryReport(report);
    expect(serialized).not.toContain(privateNote);
    expect(serialized).not.toContain(privateUrl);
    expect(serialized).not.toContain(privateName);
    expect(report.legacy.workspaceCount).toBe(2);
    const rowsByWorkspace = report.legacy.variationRowsByWorkspace as Record<
      string,
      {
        rowCount: number;
        currentPayload: { videoUrlByHost: { youtube: number } };
      }
    >;
    const workspaceRow = rowsByWorkspace.workspace_001;
    expect(workspaceRow).toBeDefined();
    expect(workspaceRow?.rowCount).toBe(1);
    expect(report.legacy.workspacesWithoutExplicitRow).toBe(1);
    expect(workspaceRow?.currentPayload.videoUrlByHost.youtube).toBe(1);
    expect(report.canonical.exerciseVersions.rowsWithInstructions).toBe(1);
  });

  it('counts top-level version defaults before nested compatibility aliases', () => {
    const report = summarizeInventory({
      workspaces: [],
      variations: [],
      variationVersions: [],
      exercises: [],
      workspaceExercises: [],
      exerciseVersions: [
        {
          exercise_id: 'exercise-1',
          version: 1,
          payload: {
            default_rest_time: 601,
            default_rir: 6,
            default_reps: 200,
            defaults: {
              default_rest_time: 90,
              default_rir: 2,
              default_reps: 8,
            },
          },
        },
      ],
      workspaceExerciseVersions: [],
    });

    expect(report.canonical.exerciseVersions.defaultsOutsideBounds).toEqual({
      restTimeOutOfBounds: 1,
      rirOutOfBounds: 1,
      repsOutOfBounds: 1,
    });
  });
});

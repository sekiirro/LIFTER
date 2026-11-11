import { describe, expect, it } from 'vitest';
import {
  summarizeInventory,
  serializeInventoryReport,
} from '../../scripts/f16/t068-legacy-inventory.mjs';

describe('T068 legacy inventory output', () => {
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
});

import { describe, expect, it } from 'vitest';
import type { WorkoutDocument } from '../../lib/plans/workout/schema';
import {
  listVisibleTemplates,
  TEMPLATE_PAGE_SIZE,
  type WorkoutTemplateActor,
  type WorkoutTemplateProjection,
} from '../../lib/plans/workout/template-management';

const WORKSPACE_A = 'workspace-a';
const WORKSPACE_B = 'workspace-b';

const trainer: WorkoutTemplateActor = {
  role: 'trainer',
  workspaceId: WORKSPACE_A,
};
const platformOwner: WorkoutTemplateActor = {
  role: 'platform_owner',
  workspaceId: WORKSPACE_A,
};

function document(dayId: string): WorkoutDocument {
  return {
    days: [
      {
        id: dayId,
        kind: 'session',
        title: 'Push',
        items: [
          {
            id: '20000000-0000-4000-8000-000000000001',
            exercise: { source: 'global', id: 'bench-press', version: 1 },
            sets: [
              {
                id: '30000000-0000-4000-8000-000000000001',
                type: 'working',
                reps: { value: 8 },
                load: { mode: 'added_weight', value: '20', unit: 'kg' },
              },
            ],
          },
        ],
      },
    ],
  };
}

function template(
  id: string,
  overrides: Partial<WorkoutTemplateProjection> = {},
): WorkoutTemplateProjection {
  return {
    id,
    scope: 'workspace',
    workspaceId: WORKSPACE_A,
    name: `Template ${id}`,
    version: 1,
    status: 'active',
    document: document('10000000-0000-4000-8000-000000000001'),
    promotionEligible: true,
    ...overrides,
  };
}

describe('F17 workout template management', () => {
  it('shows only visible scopes and caps a template page at twenty rows', () => {
    const templates = [
      template('global', {
        scope: 'global',
        workspaceId: undefined,
        promotionEligible: false,
      }),
      ...Array.from({ length: 23 }, (_, index) =>
        template(`workspace-${index + 1}`),
      ),
      template('foreign', { workspaceId: WORKSPACE_B }),
    ];

    const firstPage = listVisibleTemplates(trainer, templates);
    const secondPage = listVisibleTemplates(trainer, templates, 2);

    expect(firstPage.pageSize).toBe(TEMPLATE_PAGE_SIZE);
    expect(firstPage.total).toBe(24);
    expect(firstPage.items).toHaveLength(20);
    expect(firstPage.items.some((item) => item.id === 'foreign')).toBe(false);
    expect(firstPage.items.some((item) => item.id === 'global')).toBe(true);
    expect(secondPage.items).toHaveLength(4);
    expect(secondPage.items.some((item) => item.id === 'foreign')).toBe(false);
  });

  it('does not expose another workspace template even when pagination is requested', () => {
    const visible = listVisibleTemplates(trainer, [
      template('local'),
      template('foreign', { workspaceId: WORKSPACE_B }),
    ]);

    expect(visible.items.map((item) => item.id)).toEqual(['local']);
  });
});

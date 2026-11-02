import { describe, expect, it } from 'vitest';
import type { WorkoutDocument } from '../../lib/plans/workout/schema';
import {
  canEditTemplate,
  canLoadTemplate,
  canManageGlobalTemplates,
  createGlobalTemplate,
  createWorkspaceTemplate,
  editTemplate,
  listVisibleTemplates,
  loadTemplateIntoDraft,
  promoteTemplateToGlobal,
  retireTemplate,
  TEMPLATE_PAGE_SIZE,
  WorkoutTemplateManagementError,
  type WorkoutTemplateActor,
  type WorkoutTemplateProjection,
} from '../../lib/plans/workout/template-management';

const WORKSPACE_A = 'workspace-a';
const WORKSPACE_B = 'workspace-b';

const trainer: WorkoutTemplateActor = {
  role: 'trainer',
  workspaceId: WORKSPACE_A,
};
const workspaceOwner: WorkoutTemplateActor = {
  role: 'workspace_owner',
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

function idFactory(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `a0000000-0000-4000-8000-${String(next).padStart(12, '0')}`;
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
    const oversizedPage = listVisibleTemplates(trainer, templates, 1, 100);

    expect(firstPage.pageSize).toBe(TEMPLATE_PAGE_SIZE);
    expect(firstPage.total).toBe(24);
    expect(firstPage.items).toHaveLength(20);
    expect(firstPage.items.some((item) => item.id === 'foreign')).toBe(false);
    expect(firstPage.items.some((item) => item.id === 'global')).toBe(true);
    expect(secondPage.items).toHaveLength(4);
    expect(secondPage.items.some((item) => item.id === 'foreign')).toBe(false);
    expect(oversizedPage.pageSize).toBe(TEMPLATE_PAGE_SIZE);
    expect(oversizedPage.items).toHaveLength(20);
  });

  it('does not expose another workspace template even when pagination is requested', () => {
    const visible = listVisibleTemplates(trainer, [
      template('local'),
      template('foreign', { workspaceId: WORKSPACE_B }),
    ]);

    expect(visible.items.map((item) => item.id)).toEqual(['local']);
  });

  it('keeps global templates read-only for staff and gates governance to PO', () => {
    const globalTemplate = template('global', {
      scope: 'global',
      workspaceId: undefined,
      promotionEligible: false,
    });
    const workspaceTemplate = template('workspace');

    expect(canManageGlobalTemplates(trainer)).toBe(false);
    expect(canManageGlobalTemplates(workspaceOwner)).toBe(false);
    expect(canManageGlobalTemplates(platformOwner)).toBe(true);
    expect(canEditTemplate(trainer, globalTemplate)).toBe(false);
    expect(canEditTemplate(workspaceOwner, globalTemplate)).toBe(false);
    expect(canEditTemplate(platformOwner, globalTemplate)).toBe(true);
    expect(canEditTemplate(trainer, workspaceTemplate)).toBe(true);
    expect(
      canEditTemplate(
        trainer,
        template('foreign', { workspaceId: WORKSPACE_B }),
      ),
    ).toBe(false);
  });

  it('shows retired templates but never allows loading them', () => {
    const retired = template('retired', { status: 'retired' });

    expect(canLoadTemplate(trainer, retired)).toBe(false);
    expect(
      listVisibleTemplates(trainer, [retired]).items.map((item) => item.id),
    ).toEqual(['retired']);
    expect(() =>
      loadTemplateIntoDraft(retired, document('10000000-0000-4000-8000-000000000099')),
    ).toThrow(WorkoutTemplateManagementError);
  });

  it('loads an independent copy and remaps every document id', () => {
    const source = template('workspace');
    const originalDocument = structuredClone(source.document);
    const draft = document('10000000-0000-4000-8000-000000000099');

    const loaded = loadTemplateIntoDraft(source, draft, idFactory());
    const copiedDay = loaded.days[1]!;
    const copiedItem = copiedDay.items![0]!;
    const copiedSet = copiedItem.sets[0]!;

    expect(loaded.days).toHaveLength(2);
    expect(copiedDay.id).not.toBe(source.document.days[0]!.id);
    expect(copiedItem.id).not.toBe(source.document.days[0]!.items![0]!.id);
    expect(copiedSet.id).not.toBe(source.document.days[0]!.items![0]!.sets[0]!.id);
    expect(copiedDay.title).toBe(source.document.days[0]!.title);
    expect(copiedItem.exercise).toEqual(source.document.days[0]!.items![0]!.exercise);
    expect(copiedSet.reps).toEqual(source.document.days[0]!.items![0]!.sets[0]!.reps);
    expect(copiedSet.load).toEqual(source.document.days[0]!.items![0]!.sets[0]!.load);
    expect(source.document).toEqual(originalDocument);
  });

  it('keeps the draft unchanged when the source template is later edited', () => {
    const source = template('workspace');
    const loaded = loadTemplateIntoDraft(
      source,
      document('10000000-0000-4000-8000-000000000099'),
      idFactory(),
    );
    const loadedBeforeEdit = structuredClone(loaded);
    const editedDocument = structuredClone(source.document);
    editedDocument.days[0]!.title = 'Edited template';

    const edited = editTemplate(trainer, source, {
      name: 'Edited template',
      document: editedDocument,
    });

    expect(edited.version).toBe(source.version + 1);
    expect(edited.document.days[0]!.title).toBe('Edited template');
    expect(loaded).toEqual(loadedBeforeEdit);
  });

  it('creates and edits workspace templates only in the selected workspace', () => {
    const created = createWorkspaceTemplate(
      trainer,
      {
        workspaceId: WORKSPACE_A,
        name: 'Push foundation',
        document: document('10000000-0000-4000-8000-000000000001'),
      },
      idFactory(),
    );

    expect(created.scope).toBe('workspace');
    expect(created.workspaceId).toBe(WORKSPACE_A);
    expect(created.version).toBe(1);
    expect(() =>
      createWorkspaceTemplate(
        trainer,
        {
          workspaceId: WORKSPACE_B,
          name: 'Foreign',
          document: document('10000000-0000-4000-8000-000000000001'),
        },
        idFactory(),
      ),
    ).toThrow(WorkoutTemplateManagementError);
  });

  it('allows only PO to create global templates and promote eligible workspace templates', () => {
    const globalInput = {
      name: 'Global foundation',
      document: document('10000000-0000-4000-8000-000000000001'),
    };

    expect(() => createGlobalTemplate(trainer, globalInput, idFactory())).toThrow(
      WorkoutTemplateManagementError,
    );
    expect(
      createGlobalTemplate(platformOwner, globalInput, idFactory()).scope,
    ).toBe('global');
    expect(() =>
      promoteTemplateToGlobal(trainer, template('workspace'), idFactory()),
    ).toThrow(WorkoutTemplateManagementError);

    const promoted = promoteTemplateToGlobal(
      platformOwner,
      template('workspace'),
      idFactory(),
    );
    expect(promoted.scope).toBe('global');
    expect(promoted.workspaceId).toBeUndefined();
    expect(promoted.id).not.toBe('workspace');
  });

  it('retires workspace templates for authorized staff but not global templates', () => {
    const retired = retireTemplate(trainer, template('workspace'));

    expect(retired.status).toBe('retired');
    expect(retired.version).toBe(2);
    expect(() =>
      retireTemplate(
        trainer,
        template('global', {
          scope: 'global',
          workspaceId: undefined,
          promotionEligible: false,
        }),
      ),
    ).toThrow(WorkoutTemplateManagementError);
  });
});

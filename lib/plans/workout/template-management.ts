import type {
  WorkoutDay,
  WorkoutDocument,
  WorkoutExerciseReference,
  WorkoutItem,
  WorkoutSet,
} from './schema';

export type WorkoutTemplateActorRole =
  | 'platform_owner'
  | 'workspace_owner'
  | 'trainer';

export type WorkoutTemplateActor = {
  role: WorkoutTemplateActorRole;
  workspaceId: string;
};

export type WorkoutTemplateScope = 'global' | 'workspace';
export type WorkoutTemplateStatus = 'active' | 'retired';

export type WorkoutTemplateProjection = {
  id: string;
  scope: WorkoutTemplateScope;
  workspaceId?: string;
  name: string;
  description?: string;
  version: number;
  status: WorkoutTemplateStatus;
  document: WorkoutDocument;
  promotionEligible: boolean;
};

export type WorkoutTemplatePage = {
  items: readonly WorkoutTemplateProjection[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export const TEMPLATE_PAGE_SIZE = 20;

/**
 * Stable, UI-agnostic reason codes. The interface layer maps them to
 * localized copy so domain messages never leak into the product surface.
 */
export type WorkoutTemplateManagementErrorCode =
  | 'retired_template_not_loadable'
  | 'actor_not_authorized'
  | 'workspace_mismatch'
  | 'name_required'
  | 'global_governance_po_only'
  | 'edit_not_allowed'
  | 'retire_not_allowed'
  | 'promotion_not_allowed'
  | 'promotion_not_eligible';

export class WorkoutTemplateManagementError extends Error {
  readonly code: WorkoutTemplateManagementErrorCode;

  constructor(code: WorkoutTemplateManagementErrorCode, message: string) {
    super(message);
    this.name = 'WorkoutTemplateManagementError';
    this.code = code;
  }
}

function isVisibleTemplate(
  actor: WorkoutTemplateActor,
  template: WorkoutTemplateProjection,
): boolean {
  if (template.scope === 'global') return true;
  return template.workspaceId === actor.workspaceId;
}

export function listVisibleTemplates(
  actor: WorkoutTemplateActor,
  templates: readonly WorkoutTemplateProjection[],
  page = 1,
  pageSize = TEMPLATE_PAGE_SIZE,
): WorkoutTemplatePage {
  const normalizedPageSize = Math.min(
    TEMPLATE_PAGE_SIZE,
    Math.max(1, Math.trunc(pageSize)),
  );
  const visible = templates.filter((template) =>
    isVisibleTemplate(actor, template),
  );
  const pageCount = Math.ceil(visible.length / normalizedPageSize);
  const normalizedPage =
    pageCount === 0
      ? 1
      : Math.min(pageCount, Math.max(1, Math.trunc(page)));
  const start = (normalizedPage - 1) * normalizedPageSize;

  return {
    items: visible.slice(start, start + normalizedPageSize),
    total: visible.length,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    pageCount,
  };
}

export function canManageGlobalTemplates(
  actor: WorkoutTemplateActor,
): boolean {
  return actor.role === 'platform_owner';
}

export function canEditTemplate(
  actor: WorkoutTemplateActor,
  template: WorkoutTemplateProjection,
): boolean {
  if (template.status === 'retired') return false;
  if (template.scope === 'global') {
    return canManageGlobalTemplates(actor);
  }
  return (
    template.workspaceId === actor.workspaceId &&
    (actor.role === 'platform_owner' ||
      actor.role === 'workspace_owner' ||
      actor.role === 'trainer')
  );
}

export function canLoadTemplate(
  actor: WorkoutTemplateActor,
  template: WorkoutTemplateProjection,
): boolean {
  return template.status === 'active' && isVisibleTemplate(actor, template);
}

function cloneExerciseReference(
  reference: WorkoutExerciseReference,
): WorkoutExerciseReference {
  return {
    ...reference,
    ...(reference.variation === undefined
      ? {}
      : { variation: { ...reference.variation } }),
  };
}

function cloneSet(set: WorkoutSet, id: string): WorkoutSet {
  return {
    ...set,
    id,
    reps: { ...set.reps },
    load: { ...set.load },
  };
}

function cloneItem(
  item: WorkoutItem,
  id: string,
  setIds: readonly string[],
): WorkoutItem {
  return {
    ...item,
    id,
    exercise: cloneExerciseReference(item.exercise),
    ...(item.alternatives === undefined
      ? {}
      : {
          alternatives: item.alternatives.map(cloneExerciseReference),
        }),
    sets: item.sets.map((set, index) => cloneSet(set, setIds[index]!)),
  };
}

function cloneDay(
  day: WorkoutDay,
  id: string,
  itemIds: readonly string[],
  setIdsByItemId: ReadonlyMap<string, readonly string[]>,
): WorkoutDay {
  return {
    ...day,
    id,
    ...(day.items === undefined
      ? {}
      : {
          items: day.items.map((item, index) =>
            cloneItem(item, itemIds[index]!, setIdsByItemId.get(item.id) ?? []),
          ),
        }),
  };
}

function cloneDocument(document: WorkoutDocument): WorkoutDocument {
  return {
    ...document,
    days: document.days.map((day) =>
      cloneDay(
        day,
        day.id,
        (day.items ?? []).map((item) => item.id),
        new Map(
          (day.items ?? []).map((item) => [
            item.id,
            item.sets.map((set) => set.id),
          ]),
        ),
      ),
    ),
  };
}

export function loadTemplateIntoDraft(
  template: WorkoutTemplateProjection,
  draft: WorkoutDocument,
  idFactory: () => string = () => crypto.randomUUID(),
): WorkoutDocument {
  if (template.status === 'retired') {
    throw new WorkoutTemplateManagementError(
      'retired_template_not_loadable',
      'Retired templates cannot be loaded into a draft',
    );
  }

  const copiedDays = template.document.days.map((day) => {
    const dayId = idFactory();
    const itemIds = (day.items ?? []).map(() => idFactory());
    const setIdsByItemId = new Map<string, readonly string[]>();
    for (const item of day.items ?? []) {
      setIdsByItemId.set(
        item.id,
        item.sets.map(() => idFactory()),
      );
    }
    return cloneDay(day, dayId, itemIds, setIdsByItemId);
  });

  return {
    ...cloneDocument(draft),
    days: [...cloneDocument(draft).days, ...copiedDays],
  };
}

function requireAuthorizedStaff(actor: WorkoutTemplateActor): void {
  if (
    actor.role !== 'platform_owner' &&
    actor.role !== 'workspace_owner' &&
    actor.role !== 'trainer'
  ) {
    throw new WorkoutTemplateManagementError(
      'actor_not_authorized',
      'This actor cannot manage workout templates',
    );
  }
}

export function createWorkspaceTemplate(
  actor: WorkoutTemplateActor,
  input: {
    workspaceId: string;
    name: string;
    description?: string;
    document: WorkoutDocument;
  },
  idFactory: () => string = () => crypto.randomUUID(),
): WorkoutTemplateProjection {
  requireAuthorizedStaff(actor);
  if (input.workspaceId !== actor.workspaceId) {
    throw new WorkoutTemplateManagementError(
      'workspace_mismatch',
      'Workspace templates must use the explicitly selected workspace',
    );
  }
  if (!input.name.trim()) {
    throw new WorkoutTemplateManagementError(
      'name_required',
      'Template name is required',
    );
  }
  return {
    id: idFactory(),
    scope: 'workspace',
    workspaceId: input.workspaceId,
    name: input.name.trim(),
    ...(input.description?.trim()
      ? { description: input.description.trim() }
      : {}),
    version: 1,
    status: 'active',
    document: cloneDocument(input.document),
    promotionEligible: true,
  };
}

export function createGlobalTemplate(
  actor: WorkoutTemplateActor,
  input: { name: string; description?: string; document: WorkoutDocument },
  idFactory: () => string = () => crypto.randomUUID(),
): WorkoutTemplateProjection {
  if (!canManageGlobalTemplates(actor)) {
    throw new WorkoutTemplateManagementError(
      'global_governance_po_only',
      'Only platform owners can create global templates',
    );
  }
  if (!input.name.trim()) {
    throw new WorkoutTemplateManagementError(
      'name_required',
      'Template name is required',
    );
  }
  return {
    id: idFactory(),
    scope: 'global',
    name: input.name.trim(),
    ...(input.description?.trim()
      ? { description: input.description.trim() }
      : {}),
    version: 1,
    status: 'active',
    document: cloneDocument(input.document),
    promotionEligible: false,
  };
}

export function editTemplate(
  actor: WorkoutTemplateActor,
  template: WorkoutTemplateProjection,
  patch: { name: string; description?: string; document: WorkoutDocument },
): WorkoutTemplateProjection {
  if (!canEditTemplate(actor, template)) {
    throw new WorkoutTemplateManagementError(
      'edit_not_allowed',
      'This actor cannot edit the selected template',
    );
  }
  if (!patch.name.trim()) {
    throw new WorkoutTemplateManagementError(
      'name_required',
      'Template name is required',
    );
  }
  return {
    ...template,
    name: patch.name.trim(),
    ...(patch.description?.trim()
      ? { description: patch.description.trim() }
      : { description: undefined }),
    version: template.version + 1,
    document: cloneDocument(patch.document),
  };
}

export function retireTemplate(
  actor: WorkoutTemplateActor,
  template: WorkoutTemplateProjection,
): WorkoutTemplateProjection {
  if (!canEditTemplate(actor, template)) {
    throw new WorkoutTemplateManagementError(
      'retire_not_allowed',
      'This actor cannot retire the selected template',
    );
  }
  return {
    ...template,
    status: 'retired',
    version: template.version + 1,
  };
}

export function promoteTemplateToGlobal(
  actor: WorkoutTemplateActor,
  template: WorkoutTemplateProjection,
  idFactory: () => string = () => crypto.randomUUID(),
): WorkoutTemplateProjection {
  if (!canManageGlobalTemplates(actor)) {
    throw new WorkoutTemplateManagementError(
      'global_governance_po_only',
      'Only platform owners can make a workspace template global',
    );
  }
  if (
    template.scope !== 'workspace' ||
    template.status !== 'active' ||
    template.workspaceId !== actor.workspaceId
  ) {
    throw new WorkoutTemplateManagementError(
      'promotion_not_allowed',
      'This actor cannot promote the selected template',
    );
  }
  if (!template.promotionEligible) {
    throw new WorkoutTemplateManagementError(
      'promotion_not_eligible',
      'This workspace template is not eligible to become global',
    );
  }
  return {
    id: idFactory(),
    scope: 'global',
    name: template.name,
    ...(template.description ? { description: template.description } : {}),
    version: 1,
    status: 'active',
    document: cloneDocument(template.document),
    promotionEligible: false,
  };
}

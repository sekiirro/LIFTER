import type { WorkoutDocument } from './schema';

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

// RED scaffold: the implementation replaces these deliberately incorrect
// projections after the failing scope/pagination assertions are recorded.
export function listVisibleTemplates(
  _actor: WorkoutTemplateActor,
  _templates: readonly WorkoutTemplateProjection[],
  _page = 1,
  _pageSize = TEMPLATE_PAGE_SIZE,
): WorkoutTemplatePage {
  return { items: [], total: 0, page: 1, pageSize: TEMPLATE_PAGE_SIZE, pageCount: 0 };
}

export function canManageGlobalTemplates(
  _actor: WorkoutTemplateActor,
): boolean {
  return false;
}

export function canEditTemplate(
  _actor: WorkoutTemplateActor,
  _template: WorkoutTemplateProjection,
): boolean {
  return false;
}

export function canLoadTemplate(
  _actor: WorkoutTemplateActor,
  _template: WorkoutTemplateProjection,
): boolean {
  return false;
}

export function loadTemplateIntoDraft(
  _template: WorkoutTemplateProjection,
  draft: WorkoutDocument,
  _idFactory: () => string = () => crypto.randomUUID(),
): WorkoutDocument {
  return draft;
}

export function createWorkspaceTemplate(
  _actor: WorkoutTemplateActor,
  _input: {
    workspaceId: string;
    name: string;
    description?: string;
    document: WorkoutDocument;
  },
  _idFactory: () => string = () => crypto.randomUUID(),
): WorkoutTemplateProjection {
  throw new Error('Not implemented');
}

export function createGlobalTemplate(
  _actor: WorkoutTemplateActor,
  _input: { name: string; description?: string; document: WorkoutDocument },
  _idFactory: () => string = () => crypto.randomUUID(),
): WorkoutTemplateProjection {
  throw new Error('Not implemented');
}

export function editTemplate(
  _actor: WorkoutTemplateActor,
  template: WorkoutTemplateProjection,
  _patch: { name: string; description?: string; document: WorkoutDocument },
): WorkoutTemplateProjection {
  return template;
}

export function retireTemplate(
  _actor: WorkoutTemplateActor,
  template: WorkoutTemplateProjection,
): WorkoutTemplateProjection {
  return template;
}

export function promoteTemplateToGlobal(
  _actor: WorkoutTemplateActor,
  template: WorkoutTemplateProjection,
): WorkoutTemplateProjection {
  return template;
}

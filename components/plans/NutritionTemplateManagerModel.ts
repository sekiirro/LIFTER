import type { NutritionDocument } from '../../lib/plans/nutrition/schema';

export const DEFAULT_TEMPLATE_PAGE_SIZE = 20;
export const MAX_TEMPLATE_PAGE_SIZE = 50;

export type NutritionTemplateVersion = {
  version: number;
  document: NutritionDocument;
};

export type NutritionTemplate = {
  id: string;
  name: { ar: string; en: string };
  scope: 'global' | 'workspace';
  workspaceId?: string;
  retired: boolean;
  eligibleForGlobal: boolean;
  origin?: string;
  versions: readonly NutritionTemplateVersion[];
};

export type NutritionTemplatePage = {
  items: readonly NutritionTemplate[];
  page: number;
  pageSize: number;
  totalPages: number;
};

export function scopeNutritionTemplates(
  templates: readonly NutritionTemplate[],
  scope: NutritionTemplate['scope'],
  selectedWorkspaceId: string,
): NutritionTemplate[] {
  return templates.filter(
    (template) =>
      template.scope === scope &&
      (scope === 'global' || template.workspaceId === selectedWorkspaceId),
  );
}

export function paginateNutritionTemplates(
  templates: readonly NutritionTemplate[],
  requestedPage: number,
  requestedPageSize = DEFAULT_TEMPLATE_PAGE_SIZE,
): NutritionTemplatePage {
  const pageSize = Math.min(
    MAX_TEMPLATE_PAGE_SIZE,
    Math.max(1, Math.floor(requestedPageSize) || DEFAULT_TEMPLATE_PAGE_SIZE),
  );
  const totalPages = Math.max(1, Math.ceil(templates.length / pageSize));
  const page = Math.min(
    totalPages,
    Math.max(1, Math.floor(requestedPage) || 1),
  );
  const offset = (page - 1) * pageSize;
  return {
    items: templates.slice(offset, offset + pageSize),
    page,
    pageSize,
    totalPages,
  };
}

export function copyNutritionTemplateVersion(
  template: NutritionTemplate,
  versionNumber: number,
): {
  sourceTemplateId: string;
  sourceVersion: number;
  document: NutritionDocument;
} | null {
  const source = template.versions.find(
    (version) => version.version === versionNumber,
  );
  if (!source || template.retired) return null;
  return {
    sourceTemplateId: template.id,
    sourceVersion: source.version,
    document: structuredClone(source.document),
  };
}

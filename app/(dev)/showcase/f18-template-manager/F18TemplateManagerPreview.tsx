'use client';

import {
  NutritionTemplateManager,
  type NutritionTemplateSummary,
} from '../../../../components/plans/nutrition/NutritionTemplateManager';
import type { Locale } from '../../../../lib/design/preferences';

const MOCK_TEMPLATES: NutritionTemplateSummary[] = [
  {
    id: 'showcase-global-1',
    name: 'Global Ramadan Plan',
    scope: 'global',
    version: 2,
    retired: false,
  },
  {
    id: 'showcase-global-2',
    name: 'Old Global Off-Season Plan',
    scope: 'global',
    version: 1,
    retired: true,
  },
  {
    id: 'showcase-workspace-1',
    name: 'Kendo Cut Plan With A Very Long Name To Exercise Wrapping',
    scope: 'workspace',
    version: 1,
    retired: false,
  },
  {
    id: 'showcase-workspace-2',
    name: 'Kendo Copy of Global Ramadan Plan',
    scope: 'workspace',
    version: 3,
    retired: false,
    originName: 'Global Ramadan Plan',
    originVersion: 2,
  },
  {
    id: 'showcase-workspace-3',
    name: 'Retired Workspace Plan',
    scope: 'workspace',
    version: 1,
    retired: true,
  },
];

const noop = () => {};

/**
 * Local host for the F18 slice 2 template-manager preview. Template rows are
 * static mocks; every action is owned by the eventual page, so callbacks are
 * no-ops here. One variant per page load (role/status from search params) so
 * the rendered landmark tree matches the single-manager production shape.
 */
export function F18TemplateManagerPreview({
  locale,
  role,
  status,
}: {
  locale: Locale;
  role: 'PO' | 'Trainer' | 'Sales';
  status: 'ready' | 'loading' | 'error';
}) {
  return (
    <NutritionTemplateManager
      locale={locale}
      role={role}
      status={status}
      templates={status === 'ready' ? MOCK_TEMPLATES : []}
      onRetry={noop}
      onLoadVersion={noop}
      onCreateVersion={noop}
      onRetire={noop}
      onMakeGlobal={noop}
      onCreate={noop}
    />
  );
}

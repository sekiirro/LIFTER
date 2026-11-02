'use client';

import { NutritionTemplateManager } from '../../../../components/plans/NutritionTemplateManager';
import { BrandScope } from '../../../../components/ui/BrandScope';
import type { NutritionTemplate } from '../../../../components/plans/NutritionTemplateManagerModel';
import type { Locale } from '../../../../lib/design/preferences';

export function NutritionTemplateShowcase({
  locale,
  role,
  templates,
}: {
  locale: Locale;
  role: 'po' | 'staff';
  templates: readonly NutritionTemplate[];
}) {
  return (
    <BrandScope color="#2563EB" data-testid="template-brand-scope">
      <NutritionTemplateManager
        locale={locale}
        role={role}
        selectedWorkspaceId="workspace-a"
        canReadGlobalTemplates
        canManageWorkspaceTemplates
        templates={templates}
        onCreate={() => undefined}
        onCreateVersion={() => undefined}
        onRetire={() => undefined}
        onMakeItGlobal={() => undefined}
        onLoadIntoDraft={() => undefined}
      />
    </BrandScope>
  );
}

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  NutritionTemplateManager,
  type NutritionTemplateRole,
  type NutritionTemplateSummary,
} from '../../components/plans/nutrition/NutritionTemplateManager';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

const TEMPLATES: NutritionTemplateSummary[] = [
  {
    id: 'g1',
    name: 'Global Ramadan Plan',
    scope: 'global',
    version: 2,
    retired: false,
  },
  {
    id: 'g2',
    name: 'Old Global Plan',
    scope: 'global',
    version: 1,
    retired: true,
  },
  {
    id: 'w1',
    name: 'Kendo Cut Plan',
    scope: 'workspace',
    version: 1,
    retired: false,
  },
  {
    id: 'w2',
    name: 'Kendo Copy of Global Ramadan Plan',
    scope: 'workspace',
    version: 3,
    retired: false,
    originName: 'Global Ramadan Plan',
    originVersion: 2,
  },
  {
    id: 'w3',
    name: 'Retired Workspace Plan',
    scope: 'workspace',
    version: 1,
    retired: true,
  },
];

function render(
  locale: 'ar' | 'en',
  role: NutritionTemplateRole = 'Trainer',
  templates: NutritionTemplateSummary[] = TEMPLATES,
  status: 'ready' | 'loading' | 'error' = 'ready',
) {
  return renderToStaticMarkup(
    createElement(NutritionTemplateManager, {
      locale,
      role,
      status,
      templates,
      onRetry: () => {},
      onLoadVersion: () => {},
      onCreateVersion: () => {},
      onRetire: () => {},
      onMakeGlobal: () => {},
      onCreate: () => {},
    }),
  );
}

describe('F18 T025 slice 2 NutritionTemplateManager (FR-007, FR-009, FR-017, FR-021)', () => {
  it('renders PO-approved EN headings with LTR direction', () => {
    const html = render('en', 'PO');

    expect(html).toContain('dir="ltr"');
    expect(html).toContain('lang="en"');
    expect(html).toContain(en['nutritionTemplates.title']);
    expect(html).toContain(en['nutritionTemplates.intro']);
    expect(html).toContain(en['nutritionTemplates.global']);
    expect(html).toContain(en['nutritionTemplates.workspace']);
  });

  it('renders PO-approved AR headings with RTL direction', () => {
    const html = render('ar', 'PO');

    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain(ar['nutritionTemplates.title']);
    expect(html).toContain(ar['nutritionTemplates.intro']);
    expect(html).toContain(ar['nutritionTemplates.global']);
    expect(html).toContain(ar['nutritionTemplates.workspace']);
  });

  it('lists items with isolated version numbers and active/retired distinction', () => {
    const html = render('en', 'PO');

    expect(html).toContain('Global Ramadan Plan');
    expect(html).toContain('Kendo Cut Plan');
    expect(html).toContain(en['nutritionTemplates.version']);
    expect(html).toContain('<bdi dir="ltr">2</bdi>');
    expect(html).toContain(en['nutritionTemplates.retired']);

    // Retired templates offer no load entry point (T013: retired load refused).
    // PO view: 3 active templates (g1, w1, w2) each expose exactly one Load.
    expect(html.match(/Load version into draft/g)?.length).toBe(3);
  });

  it('exposes load/version/retire entry points with approved labels', () => {
    const html = render('en', 'Trainer');

    expect(html).toContain(en['nutritionTemplates.loadVersion']);
    expect(html).toContain(en['nutritionTemplates.createVersion']);
    expect(html).toContain(en['nutritionTemplates.retire']);
    expect(html).toContain(en['nutritionTemplates.create']);
  });

  it('gates PO-only global management by role and hides the global section from staff', () => {
    const poHtml = render('en', 'PO');
    expect(poHtml).toContain(en['nutritionTemplates.createGlobal']);
    expect(poHtml).toContain(en['nutritionTemplates.makeGlobal']);

    for (const role of ['WO', 'Trainer'] as const) {
      const staffHtml = render('en', role);
      // No global read for non-PO roles (nutrition-api.md §2).
      expect(staffHtml).not.toContain(en['nutritionTemplates.createGlobal']);
      expect(staffHtml).not.toContain(en['nutritionTemplates.makeGlobal']);
      expect(staffHtml).not.toContain(
        'data-testid="nutrition-template-scope-global"',
      );
      // Workspace entry points stay available to staff.
      expect(staffHtml).toContain(en['nutritionTemplates.create']);
      expect(staffHtml).toContain('Kendo Cut Plan');
    }
  });

  it('masks assigned-copy provenance from non-PO roles; PO view may show origin', () => {
    const poHtml = render('en', 'PO');
    expect(poHtml).toContain('data-testid="nutrition-template-origin"');

    for (const role of ['WO', 'Trainer'] as const) {
      const staffHtml = render('en', role);
      expect(staffHtml).not.toContain(
        'data-testid="nutrition-template-origin"',
      );
      expect(staffHtml).not.toContain('originName');
    }
    // Masking hides the origin even though the data is present on the copy.
    const trainerHtml = render('en', 'Trainer');
    expect(trainerHtml).toContain('Kendo Copy of Global Ramadan Plan');
  });

  it('renders the loading state with a polite live region', () => {
    const html = render('en', 'Trainer', TEMPLATES, 'loading');

    expect(html).toContain('role="status"');
    expect(html).toContain(en['nutritionTemplates.loading']);
    expect(html).not.toContain('Kendo Cut Plan');
  });

  it('renders the error state with retry next to the failure', () => {
    const html = render('en', 'Trainer', TEMPLATES, 'error');

    expect(html).toContain(en['nutritionTemplates.errorTitle']);
    expect(html).toContain(en['nutritionTemplates.errorDescription']);
    expect(html).toContain(en['nutritionTemplates.retry']);
    expect(html).not.toContain('Kendo Cut Plan');
  });

  it('denies template access to roles without template rights', () => {
    for (const role of ['Sales', 'client', 'unaffiliated'] as const) {
      const html = render('en', role);
      expect(html).toContain(en['nutritionTemplates.noAccess']);
      expect(html).not.toContain('Kendo Cut Plan');
      expect(html).not.toContain(en['nutritionTemplates.create']);
    }
  });

  it('renders the empty state when no templates exist', () => {
    const enHtml = render('en', 'Trainer', []);
    expect(enHtml).toContain(en['nutritionTemplates.empty']);

    const arHtml = render('ar', 'Trainer', []);
    expect(arHtml).toContain(ar['nutritionTemplates.empty']);
  });

  it('matches the PO-approved EN and AR strings exactly', () => {
    expect(en['nutritionTemplates.title']).toBe('Nutrition templates');
    expect(en['nutritionTemplates.intro']).toBe(
      'Browse approved versions and load one into a new plan draft.',
    );
    expect(en['nutritionTemplates.global']).toBe('Global templates');
    expect(en['nutritionTemplates.workspace']).toBe('Workspace templates');
    expect(en['nutritionTemplates.create']).toBe('Create template');
    expect(en['nutritionTemplates.createGlobal']).toBe(
      'Create global template',
    );
    expect(en['nutritionTemplates.createVersion']).toBe('Create version');
    expect(en['nutritionTemplates.retire']).toBe('Retire template');
    expect(en['nutritionTemplates.makeGlobal']).toBe('Make it Global');
    expect(en['nutritionTemplates.retired']).toBe('Retired');
    expect(en['nutritionTemplates.version']).toBe('Version');
    expect(en['nutritionTemplates.loadVersion']).toBe(
      'Load version into draft',
    );
    expect(en['nutritionTemplates.empty']).toBe(
      'No templates in this section yet.',
    );
    expect(en['nutritionTemplates.loading']).toBe(
      'Loading nutrition templates…',
    );
    expect(en['nutritionTemplates.errorTitle']).toBe(
      'Unable to load templates',
    );
    expect(en['nutritionTemplates.errorDescription']).toBe(
      'Try loading the template list again.',
    );
    expect(en['nutritionTemplates.retry']).toBe('Retry');
    expect(en['nutritionTemplates.noAccess']).toBe(
      'You do not have access to nutrition templates.',
    );

    expect(ar['nutritionTemplates.title']).toBe('قوالب التغذية');
    expect(ar['nutritionTemplates.intro']).toBe(
      'تصفّح الإصدارات المعتمدة وحمّل نسخة إلى مسودة خطة جديدة.',
    );
    expect(ar['nutritionTemplates.global']).toBe('قوالب عامة');
    expect(ar['nutritionTemplates.workspace']).toBe('قوالب مساحة العمل');
    expect(ar['nutritionTemplates.create']).toBe('إنشاء قالب');
    expect(ar['nutritionTemplates.createGlobal']).toBe('إنشاء قالب عام');
    expect(ar['nutritionTemplates.createVersion']).toBe('إنشاء إصدار');
    expect(ar['nutritionTemplates.retire']).toBe('إيقاف القالب');
    expect(ar['nutritionTemplates.makeGlobal']).toBe('جعله عامًا');
    expect(ar['nutritionTemplates.retired']).toBe('متوقف');
    expect(ar['nutritionTemplates.version']).toBe('الإصدار');
    expect(ar['nutritionTemplates.loadVersion']).toBe(
      'تحميل الإصدار إلى مسودة',
    );
    expect(ar['nutritionTemplates.empty']).toBe(
      'لا توجد قوالب في هذا القسم بعد.',
    );
    expect(ar['nutritionTemplates.loading']).toBe('جارٍ تحميل قوالب التغذية…');
    expect(ar['nutritionTemplates.errorTitle']).toBe('تعذر تحميل القوالب');
    expect(ar['nutritionTemplates.errorDescription']).toBe(
      'حاول تحميل قائمة القوالب مرة أخرى.',
    );
    expect(ar['nutritionTemplates.retry']).toBe('إعادة المحاولة');
    expect(ar['nutritionTemplates.noAccess']).toBe(
      'ليس لديك صلاحية الوصول إلى قوالب التغذية.',
    );
  });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  TemplateManager,
  type TemplateSummary,
} from '../../components/workout-planner/TemplateManager';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

const TEMPLATES: TemplateSummary[] = [
  {
    id: 'g1',
    name: 'Global Strength',
    scope: 'global',
    version: 2,
    retired: false,
  },
  {
    id: 'o1',
    name: 'Kendo Power',
    scope: 'own',
    version: 1,
    retired: false,
  },
  {
    id: 'a1',
    name: 'Kendo Copy of Global Strength',
    scope: 'assigned',
    version: 1,
    retired: false,
    originName: 'Global Strength',
    originVersion: 2,
  },
  {
    id: 'a2',
    name: 'Old Assigned Copy',
    scope: 'assigned',
    version: 3,
    retired: true,
    originName: 'Global Strength',
    originVersion: 1,
  },
];

function render(
  locale: 'ar' | 'en',
  role: 'PO' | 'WO' | 'Trainer' = 'Trainer',
  templates: TemplateSummary[] = TEMPLATES,
) {
  return renderToStaticMarkup(
    createElement(TemplateManager, {
      locale,
      role,
      templates,
      onLoad: () => {},
      onCreate: () => {},
      onEdit: () => {},
    }),
  );
}

describe('F17 T044 TemplateManager slice 1 (FR-008, FR-010, FR-011; SC-004)', () => {
  it('renders three scope sections with PO-approved EN headers', () => {
    const html = render('en');

    expect(html).toContain('dir="ltr"');
    expect(html).toContain('lang="en"');
    expect(html).toContain(en['templates.listTitle']);
    expect(html).toContain(en['templates.globalScope']);
    expect(html).toContain(en['templates.ownScope']);
    expect(html).toContain(en['templates.assignedScope']);
  });

  it('renders three scope sections with PO-approved AR headers (RTL)', () => {
    const html = render('ar');

    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain(ar['templates.listTitle']);
    expect(html).toContain(ar['templates.globalScope']);
    expect(html).toContain(ar['templates.ownScope']);
    expect(html).toContain(ar['templates.assignedScope']);
  });

  it('lists items with version and active/retired state distinction', () => {
    const html = render('en');

    expect(html).toContain('Global Strength');
    expect(html).toContain('Kendo Power');
    expect(html).toContain('Kendo Copy of Global Strength');
    expect(html).toContain(en['templates.active']);
    expect(html).toContain(en['templates.retired']);
    // Own version number is isolated LTR.
    expect(html).toContain('<bdi dir="ltr">2</bdi>');

    // Retired assigned copy offers no Load entry point.
    expect(html).not.toContain('Load into draft: Old Assigned Copy');
  });

  it('exposes load/create/edit entry points with accessible names', () => {
    const html = render('en', 'Trainer');

    expect(html).toContain('Load into draft: Kendo Power');
    expect(html).toContain('Edit: Kendo Power');
    expect(html).toContain(en['templates.createWorkspace']);
  });

  it('gates PO-only global controls by role prop', () => {
    const poHtml = render('en', 'PO');
    expect(poHtml).toContain(en['templates.createGlobal']);

    for (const role of ['WO', 'Trainer'] as const) {
      const staffHtml = render('en', role);
      expect(staffHtml).not.toContain(en['templates.createGlobal']);
      // Workspace entry point stays available to staff.
      expect(staffHtml).toContain(en['templates.createWorkspace']);
    }
  });

  it('masks assigned-copy provenance from non-PO roles; PO view may show origin', () => {
    const poHtml = render('en', 'PO');
    expect(poHtml).toContain('data-testid="template-origin"');

    for (const role of ['WO', 'Trainer'] as const) {
      const staffHtml = render('en', role);
      expect(staffHtml).not.toContain('data-testid="template-origin"');
      expect(staffHtml).not.toContain('originName');
    }
    // Masking hides the origin even though the data is present on the copy.
    const trainerHtml = render('en', 'Trainer');
    expect(trainerHtml).toContain('Kendo Copy of Global Strength');
  });

  it('renders the empty state when no templates exist', () => {
    const enHtml = render('en', 'Trainer', []);
    expect(enHtml).toContain(en['templates.empty']);

    const arHtml = render('ar', 'Trainer', []);
    expect(arHtml).toContain(ar['templates.empty']);
  });

  it('matches the PO-approved EN and AR strings exactly', () => {
    expect(en['templates.listTitle']).toBe('Available templates');
    expect(en['templates.globalScope']).toBe('Global');
    expect(en['templates.ownScope']).toBe('My templates');
    expect(en['templates.assignedScope']).toBe('Assigned templates');
    expect(en['templates.active']).toBe('Active');
    expect(en['templates.retired']).toBe('Retired');
    expect(en['templates.version']).toBe('Version');
    expect(en['templates.load']).toBe('Load into draft');
    expect(en['templates.loadNamed']).toBe('Load into draft: {name}');
    expect(en['templates.edit']).toBe('Edit');
    expect(en['templates.editNamed']).toBe('Edit: {name}');
    expect(en['templates.createWorkspace']).toBe('Create workspace template');
    expect(en['templates.createGlobal']).toBe('Create global template');
    expect(en['templates.empty']).toBe('No templates are available.');

    expect(ar['templates.listTitle']).toBe('القوالب المتاحة');
    expect(ar['templates.globalScope']).toBe('عام');
    expect(ar['templates.ownScope']).toBe('قوالبي');
    expect(ar['templates.assignedScope']).toBe('القوالب المضافة');
    expect(ar['templates.active']).toBe('نشط');
    expect(ar['templates.retired']).toBe('متقاعد');
    expect(ar['templates.version']).toBe('الإصدار');
    expect(ar['templates.load']).toBe('تحميل في مسودة');
    expect(ar['templates.loadNamed']).toBe('تحميل في مسودة: {name}');
    expect(ar['templates.edit']).toBe('تعديل');
    expect(ar['templates.editNamed']).toBe('تعديل: {name}');
    expect(ar['templates.createWorkspace']).toBe('إنشاء قالب لمساحة العمل');
    expect(ar['templates.createGlobal']).toBe('إنشاء قالب عام');
    expect(ar['templates.empty']).toBe('لا توجد قوالب متاحة.');
  });
});

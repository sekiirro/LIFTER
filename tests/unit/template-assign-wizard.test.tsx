import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';
import type {
  AssignReceiptItem,
  AssignTemplateOption,
  AssignWorkspaceOption,
} from '../../components/workout-planner/TemplateAssignWizard';

const TEMPLATES: AssignTemplateOption[] = [
  { id: 't1', name: 'Global Strength', retired: false },
  { id: 't2', name: 'Old Cardio', retired: true },
];

const WORKSPACES: AssignWorkspaceOption[] = [
  { id: 'w-beta', name: 'Beta' },
  { id: 'w-kendo', name: 'Kendo' },
];

const RECEIPT: AssignReceiptItem[] = [
  {
    workspaceId: 'w-beta',
    workspaceName: 'Beta',
    outcome: 'assigned',
    copiedTemplateIds: ['t1'],
    skippedTemplateIds: [],
  },
  {
    workspaceId: 'w-kendo',
    workspaceName: 'Kendo',
    outcome: 'skipped_already_assigned',
    copiedTemplateIds: [],
    skippedTemplateIds: [],
  },
  {
    workspaceId: 'w-alpha',
    workspaceName: 'Alpha',
    outcome: 'skipped_existing',
    copiedTemplateIds: [],
    skippedTemplateIds: ['t1'],
  },
  {
    workspaceId: 'w-gamma',
    workspaceName: 'Gamma',
    outcome: 'no_copies',
    copiedTemplateIds: [],
    skippedTemplateIds: ['t1'],
  },
];

async function renderWizard(props: Record<string, unknown>) {
  const { TemplateAssignWizard } =
    await import('../../components/workout-planner/TemplateAssignWizard');
  return renderToStaticMarkup(
    createElement(TemplateAssignWizard, {
      locale: 'en',
      role: 'PO',
      templates: TEMPLATES,
      workspaces: WORKSPACES,
      receipt: null,
      ...(props as object),
    } as never),
  );
}

/** React escapes quotes/apostrophes in static markup; restore raw copy. */
function text(html: string): string {
  return html
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

function pick(
  messages: Record<string, string>,
  prefix: 'templates.assign' | 'templates.outcome' | 'templates.explain',
) {
  return Object.fromEntries(
    Object.entries(messages).filter(
      ([key]) =>
        key.startsWith(prefix) &&
        key.length > prefix.length &&
        /[A-Z]/.test(key[prefix.length] ?? ''),
    ),
  );
}

describe('F17 T044 TemplateAssignWizard slice 2 (FR-008, FR-010, FR-011; SC-004)', () => {
  it('renders Step 1 with PO-approved EN copy (LTR)', async () => {
    const html = await renderWizard({ locale: 'en' });
    expect(html).toContain('dir="ltr"');
    expect(html).toContain(en['templates.assignStep1Title']);
    expect(html).toContain(en['templates.assignModeAll']);
    expect(html).toContain(en['templates.assignModeSpecific']);
    expect(html).toContain(en['templates.assignModeAllExcept']);
    expect(html).toContain(en['templates.assignNext']);
  });

  it('renders Step 1 with PO-approved AR copy (RTL)', async () => {
    const html = await renderWizard({ locale: 'ar' });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain(ar['templates.assignStep1Title']);
    expect(html).toContain(ar['templates.assignModeAll']);
    expect(html).toContain(ar['templates.assignNext']);
  });

  it('renders Step 2 workspace targets', async () => {
    const html = await renderWizard({ locale: 'en', initialStep: 2 });
    expect(html).toContain(en['templates.assignStep2Title']);
    expect(html).toContain(en['templates.assignTargetAll']);
    expect(html).toContain(en['templates.assignTargetSpecific']);
    expect(html).toContain(en['templates.assignBack']);
  });

  it('review shows all four receipt outcomes with skip explanations', async () => {
    const html = text(
      await renderWizard({
        locale: 'en',
        initialStep: 3,
        receipt: RECEIPT,
      }),
    );
    expect(html).toContain(en['templates.assignReviewTitle']);
    expect(html).toContain(en['templates.outcomeAssigned']);
    expect(html).toContain(en['templates.outcomeSkippedAssigned']);
    expect(html).toContain(en['templates.outcomeSkippedExisting']);
    expect(html).toContain(en['templates.outcomeNoCopies']);
    expect(html).toContain(en['templates.explainSkippedAssigned']);
    expect(html).toContain(en['templates.explainSkippedExisting']);
    expect(html).toContain(en['templates.explainNoCopies']);
    expect(html).toContain(en['templates.assignConfirm']);
    // State distinction: per-template skip differs from workspace-level skip.
    expect(en['templates.outcomeSkippedExisting']).not.toBe(
      en['templates.outcomeSkippedAssigned'],
    );
  });

  it('zero-copies rejection shows assignNothing without confirm', async () => {
    const html = await renderWizard({
      locale: 'en',
      initialStep: 3,
      receipt: [],
    });
    expect(html).toContain(en['templates.assignNothing']);
    expect(html).not.toContain(en['templates.assignConfirm']);
  });

  it('non-PO roles render nothing (scope gating)', async () => {
    for (const role of [
      'WO',
      'Trainer',
      'Sales',
      'client',
      'unaffiliated',
    ] as const) {
      const html = await renderWizard({ locale: 'en', role });
      expect(html).toBe('');
    }
    const poHtml = await renderWizard({ locale: 'en', role: 'PO' });
    expect(poHtml).not.toBe('');
  });

  it('retired templates are not selectable', async () => {
    const html = await renderWizard({
      locale: 'en',
      initialSelectionMode: 'specific',
    });
    expect(html).toContain('disabled');
    expect(html).toContain(en['templates.assignSelectOne']);
  });

  it('matches the PO-approved wizard bytes exactly (S60-PO-8)', async () => {
    expect(pick(en, 'templates.assign')).toEqual({
      'templates.assignStep1Title': 'Step 1: Choose templates',
      'templates.assignModeAll': 'All global templates',
      'templates.assignModeSpecific': 'Specific templates',
      'templates.assignModeAllExcept': 'All except…',
      'templates.assignSelectOne': 'Select at least one template.',
      'templates.assignStep2Title': 'Step 2: Choose workspaces',
      'templates.assignTargetAll': 'All workspaces',
      'templates.assignTargetSpecific': 'Specific workspaces',
      'templates.assignReviewTitle': 'Review',
      'templates.assignBack': 'Back',
      'templates.assignNext': 'Next',
      'templates.assignConfirm': 'Add templates',
      'templates.assignNothing':
        'Nothing to add: every selected workspace already has these templates.',
    });
    expect(pick(en, 'templates.outcome')).toEqual({
      'templates.outcomeAssigned': 'Added',
      'templates.outcomeSkippedAssigned': 'Skipped: received before',
      'templates.outcomeSkippedExisting': 'Skipped: already has it',
      'templates.outcomeNoCopies': 'Nothing added',
    });
    expect(pick(en, 'templates.explain')).toEqual({
      'templates.explainSkippedAssigned':
        'This workspace received templates before, so "All workspaces" skips it.',
      'templates.explainSkippedExisting':
        "This workspace already has this template, so it wasn't copied again.",
      'templates.explainNoCopies':
        'Every selected template already exists here.',
    });
    expect(pick(ar, 'templates.assign')).toEqual({
      'templates.assignStep1Title': 'الخطوة 1: اختار القوالب',
      'templates.assignModeAll': 'كل القوالب العامة',
      'templates.assignModeSpecific': 'قوالب محددة',
      'templates.assignModeAllExcept': 'الكل ما عدا…',
      'templates.assignSelectOne': 'اختار قالب واحد على الأقل.',
      'templates.assignStep2Title': 'الخطوة 2: اختار مساحات العمل',
      'templates.assignTargetAll': 'كل مساحات العمل',
      'templates.assignTargetSpecific': 'مساحات عمل محددة',
      'templates.assignReviewTitle': 'مراجعة',
      'templates.assignBack': 'رجوع',
      'templates.assignNext': 'التالي',
      'templates.assignConfirm': 'أضف القوالب',
      'templates.assignNothing':
        'مفيش حاجة تتضاف: كل مساحات العمل المختارة عندها القوالب دي.',
    });
    expect(pick(ar, 'templates.outcome')).toEqual({
      'templates.outcomeAssigned': 'اتضافت',
      'templates.outcomeSkippedAssigned': 'اتخطّت: استلمت قبل كده',
      'templates.outcomeSkippedExisting': 'اتخطّت: عندها القالب',
      'templates.outcomeNoCopies': 'مفيش حاجة اتضافت',
    });
    expect(pick(ar, 'templates.explain')).toEqual({
      'templates.explainSkippedAssigned':
        'مساحة العمل دي استلمت قوالب قبل كده، فـ"كل مساحات العمل" بتتخطاها.',
      'templates.explainSkippedExisting':
        'مساحة العمل دي عندها القالب ده، فماتنسخش تاني.',
      'templates.explainNoCopies': 'كل القوالب المختارة موجودة هنا بالفعل.',
    });
  });
});

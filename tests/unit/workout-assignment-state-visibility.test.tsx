import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  TemplateManager,
  type TemplateSummary,
} from '../../components/workout-planner/TemplateManager';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';
import {
  assignmentState,
  hasOwnTemplates,
  type AssignmentWorkspace,
} from '../../lib/workout-planner/assignment';

// F17 T046: Assignment state visibility tests (FR-011, SC-004).
// Never-assigned, intentionally partial, and own-templates-only must be
// distinguishable in the PO view and in run receipts.

function renderManager(
  locale: 'en' | 'ar',
  role: 'PO' | 'WO' | 'Trainer',
  templates: TemplateSummary[],
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

describe('F17 T046: PO view assignment state visibility (FR-011, SC-004)', () => {
  const ownTemplate: TemplateSummary = {
    id: 'own-1',
    name: 'Kendo Power',
    scope: 'own',
    version: 1,
    retired: false,
  };

  const assignedTemplate: TemplateSummary = {
    id: 'assigned-1',
    name: 'Kendo Copy of Global Strength',
    scope: 'assigned',
    version: 1,
    retired: false,
    originName: 'Global Strength',
    originVersion: 2,
  };

  it('distinguishes never-assigned, own-templates-only, and intentionally partial in PO view (EN LTR)', () => {
    // State 1: Never-assigned workspace (holds no templates of its own or assigned copies)
    const htmlNever = renderManager('en', 'PO', []);
    expect(htmlNever).toContain('dir="ltr"');
    expect(htmlNever).toContain(en['templates.listTitle']);
    // Both workspace-scoped sections show empty state
    expect(htmlNever).toContain(en['templates.empty']);
    expect(htmlNever).not.toContain('data-testid="template-origin"');
    expect(htmlNever).not.toContain('Kendo Power');
    expect(htmlNever).not.toContain('Kendo Copy of Global Strength');

    // State 2: Own-templates-only workspace (holds self-created templates, zero assigned copies)
    const htmlOwn = renderManager('en', 'PO', [ownTemplate]);
    expect(htmlOwn).toContain('Kendo Power');
    expect(htmlOwn).not.toContain('data-testid="template-origin"');
    expect(htmlOwn).not.toContain('Kendo Copy of Global Strength');
    // Assigned scope is empty, but own scope is populated
    expect(htmlOwn).toContain(en['templates.ownScope']);

    // State 3: Intentionally partial workspace (holds assigned copies with provenance)
    const htmlPartial = renderManager('en', 'PO', [assignedTemplate]);
    expect(htmlPartial).toContain('Kendo Copy of Global Strength');
    // PO view displays provenance origin for assigned copies
    expect(htmlPartial).toContain('data-testid="template-origin"');
    expect(htmlPartial).toContain('Global Strength · 2');
    expect(htmlPartial).not.toContain('Kendo Power');

    // All three states produce mutually distinguishable rendered markup
    expect(htmlNever).not.toBe(htmlOwn);
    expect(htmlNever).not.toBe(htmlPartial);
    expect(htmlOwn).not.toBe(htmlPartial);

    // Structural invariant: only intentionally partial renders template-origin to PO
    expect(htmlNever.includes('data-testid="template-origin"')).toBe(false);
    expect(htmlOwn.includes('data-testid="template-origin"')).toBe(false);
    expect(htmlPartial.includes('data-testid="template-origin"')).toBe(true);

    // Structural invariant: only own-templates-only populates the own scope without assigned copies
    expect(htmlOwn.includes('Kendo Power')).toBe(true);
    expect(htmlNever.includes('Kendo Power')).toBe(false);
    expect(htmlPartial.includes('Kendo Power')).toBe(false);
  });

  it('distinguishes all three states in Arabic RTL with PO-approved copy', () => {
    const htmlNeverAr = renderManager('ar', 'PO', []);
    expect(htmlNeverAr).toContain('dir="rtl"');
    expect(htmlNeverAr).toContain('lang="ar"');
    expect(htmlNeverAr).toContain(ar['templates.empty']);
    expect(htmlNeverAr).not.toContain('data-testid="template-origin"');

    const htmlOwnAr = renderManager('ar', 'PO', [ownTemplate]);
    expect(htmlOwnAr).toContain('dir="rtl"');
    expect(htmlOwnAr).toContain(ar['templates.ownScope']);
    expect(htmlOwnAr).toContain('Kendo Power');
    expect(htmlOwnAr).not.toContain('data-testid="template-origin"');

    const htmlPartialAr = renderManager('ar', 'PO', [assignedTemplate]);
    expect(htmlPartialAr).toContain('dir="rtl"');
    expect(htmlPartialAr).toContain(ar['templates.assignedScope']);
    expect(htmlPartialAr).toContain('Kendo Copy of Global Strength');
    expect(htmlPartialAr).toContain('data-testid="template-origin"');
    expect(htmlPartialAr).toContain('Global Strength · 2');

    expect(htmlNeverAr).not.toBe(htmlOwnAr);
    expect(htmlNeverAr).not.toBe(htmlPartialAr);
    expect(htmlOwnAr).not.toBe(htmlPartialAr);
  });

  it('restricts provenance visibility to PO and masks it from workspace staff', () => {
    const poHtml = renderManager('en', 'PO', [assignedTemplate]);
    expect(poHtml).toContain('data-testid="template-origin"');
    expect(poHtml).toContain('Global Strength · 2');

    for (const role of ['WO', 'Trainer'] as const) {
      const staffHtml = renderManager('en', role, [assignedTemplate]);
      expect(staffHtml).not.toContain('data-testid="template-origin"');
      expect(staffHtml).not.toContain('Global Strength · 2');
      // Assigned template name remains visible, but origin is masked
      expect(staffHtml).toContain('Kendo Copy of Global Strength');
    }
  });

  it('classifies all three states in the durable model without collapse', () => {
    const wsNever: AssignmentWorkspace = {
      id: 'ws-never',
      everReceivedGlobal: false,
      heldTemplateIds: [],
      hasOwnTemplates: false,
    };
    const wsOwn: AssignmentWorkspace = {
      id: 'ws-own',
      everReceivedGlobal: false,
      heldTemplateIds: [],
      hasOwnTemplates: true,
    };
    const wsPartial: AssignmentWorkspace = {
      id: 'ws-partial',
      everReceivedGlobal: true,
      heldTemplateIds: ['g1'],
      hasOwnTemplates: false,
    };

    expect(assignmentState(wsNever)).toBe('never_assigned');
    expect(assignmentState(wsOwn)).toBe('own_templates_only');
    expect(assignmentState(wsPartial)).toBe('intentionally_partial');

    // Distinctness guarantees
    expect(assignmentState(wsNever)).not.toBe(assignmentState(wsOwn));
    expect(assignmentState(wsNever)).not.toBe(assignmentState(wsPartial));
    expect(assignmentState(wsOwn)).not.toBe(assignmentState(wsPartial));

    // Own template detection helper
    expect(hasOwnTemplates(wsNever)).toBe(false);
    expect(hasOwnTemplates(wsOwn)).toBe(true);
    expect(hasOwnTemplates(wsPartial)).toBe(false);
  });
});

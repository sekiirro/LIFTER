import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AlternativesEditor } from '../../components/workout-planner/AlternativesEditor';
import { EntryPrescriptionFields } from '../../components/workout-planner/EntryPrescriptionFields';
import {
  TemplateAssignWizard,
  type AssignReceiptItem,
} from '../../components/workout-planner/TemplateAssignWizard';
import {
  TemplateManager,
  type TemplateSummary,
} from '../../components/workout-planner/TemplateManager';
import { VolumePanel } from '../../components/workout-planner/VolumePanel';
import { WorkoutPrintView } from '../../components/workout-planner/WorkoutPrintView';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';
import {
  F17_ALTERNATIVES,
  F17_PRESCRIPTION_FIXED,
  F17_PRINT_PAYLOAD,
  F17_RECEIPT,
  F17_TEMPLATES,
  F17_VOLUME_DAYS,
  F17_VOLUME_MUSCLES,
  F17_WIZARD_TEMPLATES,
  F17_WIZARD_WORKSPACES,
} from '../../app/(dev)/showcase/f17-planner/fixtures';

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('F17 T052 design-gate fixtures (FR-024; SC-013)', () => {
  it.each(['ar', 'en'] as const)(
    'manager renders scope sections with %s approved headings',
    (locale) => {
      const m = locale === 'ar' ? ar : en;
      const html = render(
        createElement(TemplateManager, {
          locale,
          role: 'PO',
          templates: F17_TEMPLATES as TemplateSummary[],
          onLoad: () => {},
          onCreate: () => {},
          onEdit: () => {},
        }),
      );
      expect(html).toContain(m['templates.listTitle']);
      expect(html).toContain(m['templates.globalScope']);
      expect(html).toContain(m['templates.ownScope']);
      expect(html).toContain(m['templates.assignedScope']);
    },
  );

  it('removing the PO role-gated provenance hides origin from trainers', () => {
    const po = render(
      createElement(TemplateManager, {
        locale: 'en',
        role: 'PO',
        templates: F17_TEMPLATES as TemplateSummary[],
        onLoad: () => {},
        onCreate: () => {},
        onEdit: () => {},
      }),
    );
    const trainer = render(
      createElement(TemplateManager, {
        locale: 'en',
        role: 'Trainer',
        templates: F17_TEMPLATES as TemplateSummary[],
        onLoad: () => {},
        onCreate: () => {},
        onEdit: () => {},
      }),
    );
    expect(po).toContain('data-testid="template-origin"');
    expect(trainer).not.toContain('data-testid="template-origin"');
    expect(po).toContain(en['templates.createGlobal']);
    expect(trainer).not.toContain(en['templates.createGlobal']);
  });

  it('empty manager renders the approved empty state', () => {
    for (const locale of ['ar', 'en'] as const) {
      const m = locale === 'ar' ? ar : en;
      const html = render(
        createElement(TemplateManager, {
          locale,
          role: 'Trainer',
          templates: [],
          onLoad: () => {},
          onCreate: () => {},
          onEdit: () => {},
        }),
      );
      expect(html).toContain(m['templates.empty']);
    }
  });

  it.each(['ar', 'en'] as const)(
    'wizard renders all three steps with %s accessible titles',
    (locale) => {
      const m = locale === 'ar' ? ar : en;
      for (const step of [1, 2, 3] as const) {
        const html = render(
          createElement(TemplateAssignWizard, {
            locale,
            role: 'PO',
            templates: F17_WIZARD_TEMPLATES,
            workspaces: F17_WIZARD_WORKSPACES,
            receipt: F17_RECEIPT as AssignReceiptItem[],
            initialStep: step,
          }),
        );
        expect(html).toContain('data-testid="template-assign-wizard"');
        if (step === 1) expect(html).toContain(m['templates.assignStep1Title']);
        if (step === 2) expect(html).toContain(m['templates.assignStep2Title']);
        if (step === 3)
          expect(html).toContain(m['templates.assignReviewTitle']);
      }
    },
  );

  it('wizard renders nothing for non-PO roles (scope gating)', () => {
    const html = render(
      createElement(TemplateAssignWizard, {
        locale: 'en',
        role: 'Trainer',
        templates: F17_WIZARD_TEMPLATES,
        workspaces: F17_WIZARD_WORKSPACES,
        receipt: null,
      }),
    );
    expect(html).toBe('');
  });

  it.each(['ar', 'en'] as const)(
    'prescription fields render ordinary editable inputs (%s)',
    (locale) => {
      const html = render(
        createElement(EntryPrescriptionFields, {
          locale,
          value: F17_PRESCRIPTION_FIXED,
          onChange: () => {},
        }),
      );
      expect(html).toContain('data-testid="entry-prescription-fields"');
      expect(html).toContain('input');
    },
  );

  it.each(['ar', 'en'] as const)(
    'alternatives editor shows the unavailable badge (%s)',
    (locale) => {
      const m = locale === 'ar' ? ar : en;
      const html = render(
        createElement(AlternativesEditor, {
          locale,
          alternatives: F17_ALTERNATIVES.alternatives,
          availability: F17_ALTERNATIVES.availability,
          names: F17_ALTERNATIVES.names,
          candidates: F17_ALTERNATIVES.candidates,
          onChange: () => {},
        }),
      );
      expect(html).toContain('data-testid="workout-alternatives-editor"');
      expect(html).toContain(m['builder.alternativeUnavailable']);
    },
  );

  it.each(['ar', 'en'] as const)(
    'volume panel renders working-set tables (%s)',
    (locale) => {
      const m = locale === 'ar' ? ar : en;
      const html = render(
        createElement(VolumePanel, {
          locale,
          days: F17_VOLUME_DAYS,
          muscles: F17_VOLUME_MUSCLES,
        }),
      );
      expect(html).toContain('data-testid="workout-volume-panel"');
      expect(html).toContain(m['workout.volume.title']);
    },
  );

  it.each(['ar', 'en'] as const)(
    'print view renders the payload with %s direction',
    (locale) => {
      const html = render(
        createElement(WorkoutPrintView, {
          locale,
          payload: F17_PRINT_PAYLOAD,
        }),
      );
      expect(html).toContain(`dir="${locale === 'ar' ? 'rtl' : 'ltr'}"`);
      expect(html).toContain(`lang="${locale}"`);
    },
  );
});

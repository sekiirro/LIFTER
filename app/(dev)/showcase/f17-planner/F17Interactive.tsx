'use client';

// F17 T052 design-gate interactive island (FR-024; SC-013).
//
// Client boundary for the stateful merged pieces (wizard steps,
// prescription editors, alternatives editor). Callbacks are local only;
// nothing is saved or fetched.

import { useState } from 'react';
import type { Locale } from '../../../../lib/design/preferences';
import type { EntryPrescriptions } from '../../../../lib/workout-planner/entry-prescriptions';
import type { WorkoutExerciseReference } from '../../../../lib/workout-planner/document';
import { AlternativesEditor } from '../../../../components/workout-planner/AlternativesEditor';
import { EntryPrescriptionFields } from '../../../../components/workout-planner/EntryPrescriptionFields';
import { TemplateAssignWizard } from '../../../../components/workout-planner/TemplateAssignWizard';
import { TemplateManager } from '../../../../components/workout-planner/TemplateManager';
import {
  F17_ALTERNATIVES,
  F17_PRESCRIPTION_FIXED,
  F17_PRESCRIPTION_RANGE,
  F17_RECEIPT,
  F17_TEMPLATES,
  F17_WIZARD_TEMPLATES,
  F17_WIZARD_WORKSPACES,
} from './fixtures';

export function F17Interactive({ locale }: { locale: Locale }) {
  const [fixed, setFixed] = useState<EntryPrescriptions>(
    F17_PRESCRIPTION_FIXED,
  );
  const [range, setRange] = useState<EntryPrescriptions>(
    F17_PRESCRIPTION_RANGE,
  );
  const [alternatives, setAlternatives] = useState<WorkoutExerciseReference[]>(
    F17_ALTERNATIVES.alternatives,
  );

  return (
    <>
      <section data-section="manager-po">
        <TemplateManager
          locale={locale}
          role="PO"
          templates={F17_TEMPLATES}
          onLoad={() => {}}
          onCreate={() => {}}
          onEdit={() => {}}
        />
      </section>
      <section data-section="manager-trainer">
        <TemplateManager
          locale={locale}
          role="Trainer"
          templates={F17_TEMPLATES}
          onLoad={() => {}}
          onCreate={() => {}}
          onEdit={() => {}}
        />
      </section>
      <section data-section="manager-empty">
        <TemplateManager
          locale={locale}
          role="Trainer"
          templates={[]}
          onLoad={() => {}}
          onCreate={() => {}}
          onEdit={() => {}}
        />
      </section>
      <section data-section="wizard-step-1">
        <TemplateAssignWizard
          locale={locale}
          role="PO"
          templates={F17_WIZARD_TEMPLATES}
          workspaces={F17_WIZARD_WORKSPACES}
          receipt={null}
          initialStep={1}
        />
      </section>
      <section data-section="wizard-step-2">
        <TemplateAssignWizard
          locale={locale}
          role="PO"
          templates={F17_WIZARD_TEMPLATES}
          workspaces={F17_WIZARD_WORKSPACES}
          receipt={null}
          initialStep={2}
        />
      </section>
      <section data-section="wizard-step-3">
        <TemplateAssignWizard
          locale={locale}
          role="PO"
          templates={F17_WIZARD_TEMPLATES}
          workspaces={F17_WIZARD_WORKSPACES}
          receipt={F17_RECEIPT}
          initialStep={3}
        />
      </section>
      <section data-section="prescription-fixed">
        <EntryPrescriptionFields
          locale={locale}
          value={fixed}
          onChange={setFixed}
        />
      </section>
      <section data-section="prescription-range">
        <EntryPrescriptionFields
          locale={locale}
          value={range}
          onChange={setRange}
          key={`range-${locale}`}
        />
      </section>
      <section data-section="alternatives">
        <AlternativesEditor
          locale={locale}
          alternatives={alternatives}
          availability={F17_ALTERNATIVES.availability}
          names={F17_ALTERNATIVES.names}
          candidates={F17_ALTERNATIVES.candidates}
          onChange={setAlternatives}
        />
      </section>
    </>
  );
}

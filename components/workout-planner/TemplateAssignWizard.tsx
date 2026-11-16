'use client';

import { useId, useState, type ReactNode } from 'react';
import { dirFor, type Locale } from '../../lib/design/preferences';
import { getMessages, type MessageKey } from '../../lib/i18n';
import {
  decideF17,
  type F17Role,
} from '../../lib/workout-planner/authorization';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import styles from './TemplateAssignWizard.module.css';

export type AssignSelectionMode = 'all' | 'specific' | 'all_except';
export type AssignTargetMode = 'all_workspaces' | 'specific';

/** Per-workspace review outcome (S60-R42: errors are not review rows). */
export type AssignReceiptOutcome =
  'assigned' | 'skipped_already_assigned' | 'skipped_existing' | 'no_copies';

export type AssignTemplateOption = {
  id: string;
  name: string;
  retired: boolean;
};

export type AssignWorkspaceOption = {
  id: string;
  name: string;
};

export type AssignReceiptItem = {
  workspaceId: string;
  workspaceName: string;
  outcome: AssignReceiptOutcome;
  copiedTemplateIds: string[];
  skippedTemplateIds: string[];
};

export type TemplateAssignWizardProps = {
  locale: Locale;
  /** PO-only: any other role renders nothing (scope gating). */
  role: F17Role;
  templates: AssignTemplateOption[];
  workspaces: AssignWorkspaceOption[];
  /** Null before the T025 RPC resolves; empty array = zero-copies rejection. */
  receipt: AssignReceiptItem[] | null;
  initialStep?: 1 | 2 | 3;
  initialSelectionMode?: AssignSelectionMode;
  initialSelectedTemplateIds?: string[];
  onConfirm?: (
    selection: { mode: AssignSelectionMode; ids: string[] },
    target: { mode: AssignTargetMode; ids: string[] },
  ) => void;
};

const OUTCOME_COPY: Record<
  AssignReceiptOutcome,
  { label: MessageKey; explanation: MessageKey | null }
> = {
  assigned: { label: 'templates.outcomeAssigned', explanation: null },
  skipped_already_assigned: {
    label: 'templates.outcomeSkippedAssigned',
    explanation: 'templates.explainSkippedAssigned',
  },
  skipped_existing: {
    label: 'templates.outcomeSkippedExisting',
    explanation: 'templates.explainSkippedExisting',
  },
  no_copies: {
    label: 'templates.outcomeNoCopies',
    explanation: 'templates.explainNoCopies',
  },
};

function ModeOption({
  name,
  checked,
  onSelect,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <label className={styles.option}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} />
      {children}
    </label>
  );
}

/**
 * PO assignment wizard, slice 2 (FR-008, FR-010, FR-011; SC-004):
 * Step 1 template selection, Step 2 workspace target, review with
 * per-workspace outcomes and skip explanations. Props/callbacks only;
 * the T025 RPC is not called here.
 */
export function TemplateAssignWizard({
  locale,
  role,
  templates,
  workspaces,
  receipt,
  initialStep = 1,
  initialSelectionMode = 'all',
  initialSelectedTemplateIds = [],
  onConfirm,
}: TemplateAssignWizardProps) {
  const m = getMessages(locale);
  const dir = dirFor(locale);
  const headingId = useId();
  const [step, setStep] = useState<1 | 2 | 3>(initialStep);
  const [selectionMode, setSelectionMode] =
    useState<AssignSelectionMode>(initialSelectionMode);
  const [targetMode, setTargetMode] =
    useState<AssignTargetMode>('all_workspaces');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>(
    initialSelectedTemplateIds,
  );
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>(
    [],
  );

  const allowed = decideF17(
    {
      role,
      workspaceRelation: 'own',
      coachingWork: true,
      membershipRevoked: false,
    },
    'assignment.run',
  ).allowed;
  if (!allowed) return null;

  const templateNames = new Map(templates.map((t) => [t.id, t.name]));
  const title =
    step === 1
      ? m['templates.assignStep1Title']
      : step === 2
        ? m['templates.assignStep2Title']
        : m['templates.assignReviewTitle'];

  function toggle(id: string, current: string[], set: (v: string[]) => void) {
    set(
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
    );
  }

  function confirm() {
    onConfirm?.(
      {
        mode: selectionMode,
        ids: selectionMode === 'all' ? [] : selectedTemplateIds,
      },
      {
        mode: targetMode,
        ids: targetMode === 'all_workspaces' ? [] : selectedWorkspaceIds,
      },
    );
  }

  return (
    <section
      dir={dir}
      lang={locale}
      aria-labelledby={headingId}
      className={styles.panel}
      data-testid="template-assign-wizard"
    >
      <h2 id={headingId} className={styles.title}>
        {title}
      </h2>

      {step === 1 && (
        <div
          role="radiogroup"
          aria-label={m['templates.assignStep1Title']}
          className={styles.options}
        >
          <ModeOption
            name={`${headingId}-selection`}
            checked={selectionMode === 'all'}
            onSelect={() => setSelectionMode('all')}
          >
            {m['templates.assignModeAll']}
          </ModeOption>
          <ModeOption
            name={`${headingId}-selection`}
            checked={selectionMode === 'specific'}
            onSelect={() => setSelectionMode('specific')}
          >
            {m['templates.assignModeSpecific']}
          </ModeOption>
          <ModeOption
            name={`${headingId}-selection`}
            checked={selectionMode === 'all_except'}
            onSelect={() => setSelectionMode('all_except')}
          >
            {m['templates.assignModeAllExcept']}
          </ModeOption>
        </div>
      )}

      {step === 1 && selectionMode !== 'all' && (
        <>
          <p className={styles.helper}>{m['templates.assignSelectOne']}</p>
          <ul className={styles.list}>
            {templates.map((t) => (
              <li key={t.id} className={styles.item}>
                <label className={styles.option}>
                  <input
                    type="checkbox"
                    checked={selectedTemplateIds.includes(t.id)}
                    disabled={t.retired}
                    onChange={() =>
                      toggle(t.id, selectedTemplateIds, setSelectedTemplateIds)
                    }
                  />
                  <Bidi>{t.name}</Bidi>
                  {t.retired && (
                    <span className={styles.badge}>
                      {m['templates.retired']}
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      {step === 2 && (
        <div
          role="radiogroup"
          aria-label={m['templates.assignStep2Title']}
          className={styles.options}
        >
          <ModeOption
            name={`${headingId}-target`}
            checked={targetMode === 'all_workspaces'}
            onSelect={() => setTargetMode('all_workspaces')}
          >
            {m['templates.assignTargetAll']}
          </ModeOption>
          <ModeOption
            name={`${headingId}-target`}
            checked={targetMode === 'specific'}
            onSelect={() => setTargetMode('specific')}
          >
            {m['templates.assignTargetSpecific']}
          </ModeOption>
        </div>
      )}

      {step === 2 && targetMode === 'specific' && (
        <ul className={styles.list}>
          {workspaces.map((w) => (
            <li key={w.id} className={styles.item}>
              <label className={styles.option}>
                <input
                  type="checkbox"
                  checked={selectedWorkspaceIds.includes(w.id)}
                  onChange={() =>
                    toggle(w.id, selectedWorkspaceIds, setSelectedWorkspaceIds)
                  }
                />
                <Bidi>{w.name}</Bidi>
              </label>
            </li>
          ))}
        </ul>
      )}

      {step === 3 && receipt !== null && receipt.length === 0 && (
        <p role="status" className={styles.empty}>
          {m['templates.assignNothing']}
        </p>
      )}

      {step === 3 && receipt !== null && receipt.length > 0 && (
        <ul className={styles.list}>
          {receipt.map((item) => {
            const copy = OUTCOME_COPY[item.outcome];
            const skippedNames = item.skippedTemplateIds
              .map((id) => templateNames.get(id) ?? id)
              .filter((name) => name.length > 0);
            return (
              <li
                key={item.workspaceId}
                className={styles.item}
                data-testid={`assign-receipt-${item.workspaceId}`}
              >
                <div className={styles.itemHead}>
                  <Bidi>{item.workspaceName}</Bidi>
                  <strong className={styles.outcome}>{m[copy.label]}</strong>
                </div>
                {copy.explanation && (
                  <p className={styles.explanation}>{m[copy.explanation]}</p>
                )}
                {item.outcome === 'assigned' && skippedNames.length > 0 && (
                  <p className={styles.explanation}>
                    {m['templates.explainSkippedExisting']}
                  </p>
                )}
                {skippedNames.length > 0 &&
                  item.outcome !== 'skipped_already_assigned' && (
                    <ul className={styles.skippedList}>
                      {skippedNames.map((name) => (
                        <li key={name}>
                          <Bidi>{name}</Bidi>
                        </li>
                      ))}
                    </ul>
                  )}
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.actions}>
        {step > 1 && (
          <Button
            variant="secondary"
            onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
          >
            {m['templates.assignBack']}
          </Button>
        )}
        {step < 3 && (
          <Button
            variant="primary"
            disabled={
              step === 1 &&
              selectionMode !== 'all' &&
              selectedTemplateIds.length === 0
            }
            onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
          >
            {m['templates.assignNext']}
          </Button>
        )}
        {step === 3 && (receipt === null || receipt.length > 0) && (
          <Button variant="primary" onClick={confirm}>
            {m['templates.assignConfirm']}
          </Button>
        )}
      </div>
    </section>
  );
}

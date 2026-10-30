import type { FormAnswerType, FormQuestion } from './validation';

export type FormsStaffRole = 'po' | 'wo' | 'trainer' | 'sales';
export type LocalizedFormsCopy = { en: string; ar: string };

export type StaffFormQuestion = Omit<FormQuestion, 'type'> & {
  type: FormAnswerType;
  label: LocalizedFormsCopy;
  optionLabels?: readonly LocalizedFormsCopy[];
};

export type StaffFormSection = {
  id: string;
  title: LocalizedFormsCopy;
};

export type StaffFormDraft = {
  id: string;
  title: LocalizedFormsCopy;
  sections: readonly StaffFormSection[];
  questions: readonly StaffFormQuestion[];
  deadlineDays: number;
  status: 'draft' | 'published' | 'retired';
  revision: number;
};

export type StaffAssignmentPreview = {
  id: string;
  formReference: string;
  clientReference: string;
  assignedAt: string;
  deadlineAt: string;
  kind: 'client-late' | 'trainer-late';
  trainerAssigned: boolean;
  resolvedAt: string | null;
};

export type FormsStaffSnapshot = {
  forms: readonly StaffFormDraft[];
  assignments: readonly StaffAssignmentPreview[];
  defaultOnboardingFormId: string | null;
};

export type FormsStaffResult =
  | { status: 'ok'; form: StaffFormDraft }
  | { status: 'invalid' | 'conflict' | 'forbidden' | 'missing' };

export type FormsStaffSelectionResult = {
  status: 'ok' | 'forbidden' | 'missing';
};

export interface FormsStaffAdapter {
  load(): Promise<FormsStaffSnapshot>;
  saveDraft(
    role: FormsStaffRole,
    form: StaffFormDraft,
  ): Promise<FormsStaffResult>;
  publish(role: FormsStaffRole, formId: string): Promise<FormsStaffResult>;
  retire(role: FormsStaffRole, formId: string): Promise<FormsStaffResult>;
  copy(role: FormsStaffRole, formId: string): Promise<FormsStaffResult>;
  selectDefaultOnboardingForm(
    role: FormsStaffRole,
    formId: string,
  ): Promise<FormsStaffSelectionResult>;
}

/** Presentation seam for the published F14 workspace brand provider. */
export interface FormsWorkspaceBrandSource {
  resolvePublishedColor(workspaceId: string): Promise<string | null>;
}

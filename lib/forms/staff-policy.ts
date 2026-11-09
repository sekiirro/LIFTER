import {
  calculateClientLateAlertSchedule,
  calculateCairoClientSubmissionDeadline,
} from './cairo-deadline';
import type { FormsStaffRole } from './staff-contracts';
import { APPROVED_FORM_BOUNDS, type FormQuestion } from './validation';

export function canManageWorkspaceForms(role: FormsStaffRole): boolean {
  return role === 'po' || role === 'wo' || role === 'trainer';
}

export function resolveClientDeadlineDays(input: {
  isDefaultOnboardingForm: boolean;
  configuredDays?: number;
}): number {
  if (input.isDefaultOnboardingForm) return 3;
  const days = input.configuredDays ?? 3;
  if (!Number.isInteger(days) || days < 1 || days > 14) {
    throw new RangeError('days must be an integer from 1 to 14');
  }
  return days;
}

export function getClientReminderSchedule(deadlineAt: string) {
  const schedule = calculateClientLateAlertSchedule(deadlineAt);
  return {
    firstAt: schedule.ownersAt,
    firstAudience: 'owners' as const,
    reassignmentResetsClock: schedule.reassignmentResetsClock,
    trainerLatePolicy: 'd03' as const,
  };
}

export function getClientAssignmentDeadline(
  assignedAt: string,
  configuredDays: number,
) {
  return calculateCairoClientSubmissionDeadline(assignedAt, configuredDays);
}

export function canAddQuestion(
  questions: readonly FormQuestion[],
  sectionId: string,
): boolean {
  return (
    questions.length < APPROVED_FORM_BOUNDS.maxQuestionsPerForm &&
    questions.filter((question) => question.sectionId === sectionId).length <
      APPROVED_FORM_BOUNDS.maxQuestionsPerSection
  );
}

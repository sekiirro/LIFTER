import {
  calculateCairoClientSubmissionDeadline,
  calculateCairoD03Deadline,
} from './cairo-deadline';
import type {
  FormsStaffAdapter,
  FormsStaffResult,
  FormsStaffSnapshot,
  FormsWorkspaceBrandSource,
  StaffFormDraft,
  StaffFormQuestion,
} from './staff-contracts';
import {
  canManageWorkspaceForms,
  resolveClientDeadlineDays,
} from './staff-policy';
import { validateFormDefinition, type FormQuestion } from './validation';
import { getMessages } from '../i18n';

export type MockFormsStaffAdapter = FormsStaffAdapter & {
  getPublishedVersions(formId: string): readonly StaffFormDraft[];
};

function freezeSnapshot<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value;
}

const DEMO_ASSIGNED_AT = '2026-10-24T12:00:00.000Z';
const demoDeadline = calculateCairoClientSubmissionDeadline(
  DEMO_ASSIGNED_AT,
  3,
).deadlineAt;

const demoAssignments = [
  {
    id: 'demo-assignment-01',
    formReference: 'FORM-DEMO-01',
    clientReference: 'CLIENT-DEMO-01',
    assignedAt: DEMO_ASSIGNED_AT,
    deadlineAt: demoDeadline,
    kind: 'client-late' as const,
    trainerAssigned: true,
    resolvedAt: null,
  },
  {
    id: 'demo-assignment-02',
    formReference: 'FORM-DEMO-02',
    clientReference: 'CLIENT-DEMO-02',
    assignedAt: DEMO_ASSIGNED_AT,
    deadlineAt: demoDeadline,
    kind: 'client-late' as const,
    trainerAssigned: false,
    resolvedAt: null,
  },
  {
    id: 'demo-delivery-01',
    formReference: 'FORM-DEMO-03',
    clientReference: 'CLIENT-DEMO-03',
    assignedAt: '2026-10-20T12:00:00.000Z',
    deadlineAt: calculateCairoD03Deadline('2026-10-20T12:00:00.000Z')
      .deadlineAt,
    kind: 'trainer-late' as const,
    trainerAssigned: true,
    resolvedAt: null,
  },
];

function result(
  status: 'invalid' | 'conflict' | 'forbidden' | 'missing',
): FormsStaffResult {
  return { status };
}

function toFormQuestion(question: StaffFormQuestion): FormQuestion {
  return Object.fromEntries(
    Object.entries(question).filter(
      ([key]) => key !== 'label' && key !== 'optionLabels',
    ),
  ) as unknown as FormQuestion;
}

function isPublishable(form: StaffFormDraft): boolean {
  if (
    form.title.en.trim() === '' ||
    form.title.ar.trim() === '' ||
    form.sections.length === 0 ||
    form.sections.some(
      (section) =>
        section.title.en.trim() === '' || section.title.ar.trim() === '',
    ) ||
    form.questions.length === 0 ||
    form.questions.some(
      (question) =>
        question.label.en.trim() === '' ||
        question.label.ar.trim() === '' ||
        question.optionLabels?.some(
          (option) => option.en.trim() === '' || option.ar.trim() === '',
        ),
    )
  ) {
    return false;
  }
  return (
    validateFormDefinition(form.questions.map(toFormQuestion)).length === 0
  );
}

export function createMockFormsStaffAdapter(): MockFormsStaffAdapter {
  let defaultOnboardingFormId = 'your-first-step';
  const forms = new Map<string, StaffFormDraft>([
    [
      defaultOnboardingFormId,
      {
        id: defaultOnboardingFormId,
        title: {
          en: getMessages('en')['forms.defaultOnboardingForm'],
          ar: getMessages('ar')['forms.defaultOnboardingForm'],
        },
        sections: [],
        questions: [],
        deadlineDays: 3,
        status: 'draft',
        revision: 0,
      },
    ],
  ]);
  const publishedVersions = new Map<string, readonly StaffFormDraft[]>();
  const versionRoots = new Map<string, string>();
  let nextId = 1;

  return {
    getPublishedVersions(formId) {
      const rootId = versionRoots.get(formId) ?? formId;
      return publishedVersions.get(rootId) ?? [];
    },
    async load(): Promise<FormsStaffSnapshot> {
      return {
        forms: [...forms.values()],
        assignments: demoAssignments,
        defaultOnboardingFormId,
      };
    },
    async saveDraft(role, form) {
      if (!canManageWorkspaceForms(role)) return result('forbidden');
      let deadlineDays: number;
      try {
        deadlineDays = resolveClientDeadlineDays({
          isDefaultOnboardingForm: form.id === defaultOnboardingFormId,
          configuredDays: form.deadlineDays,
        });
      } catch {
        return result('invalid');
      }
      if (
        form.questions.length > 0 &&
        validateFormDefinition(form.questions.map(toFormQuestion)).length > 0
      ) {
        return result('invalid');
      }
      const current = forms.get(form.id);
      if (current !== undefined && current.status !== 'draft') {
        return result('forbidden');
      }
      if (current !== undefined && current.revision !== form.revision) {
        return result('conflict');
      }
      const saved = {
        ...form,
        deadlineDays,
        status: 'draft' as const,
        revision: form.revision + 1,
      };
      if (!versionRoots.has(saved.id)) versionRoots.set(saved.id, saved.id);
      forms.set(saved.id, saved);
      return { status: 'ok', form: saved };
    },
    async publish(role, formId) {
      if (!canManageWorkspaceForms(role)) return result('forbidden');
      const current = forms.get(formId);
      if (current === undefined) return result('missing');
      if (current.status !== 'draft') return result('invalid');
      if (!isPublishable(current)) return result('invalid');
      const published = freezeSnapshot({
        ...current,
        status: 'published' as const,
        revision: current.revision + 1,
      });
      const rootId = versionRoots.get(formId) ?? formId;
      const versions = publishedVersions.get(rootId) ?? [];
      publishedVersions.set(rootId, Object.freeze([...versions, published]));
      versionRoots.set(formId, rootId);
      forms.set(formId, published);
      return { status: 'ok', form: published };
    },
    async retire(role, formId) {
      if (!canManageWorkspaceForms(role)) return result('forbidden');
      const current = forms.get(formId);
      if (current === undefined) return result('missing');
      if (current.status !== 'published') return result('invalid');
      const retired = freezeSnapshot({
        ...current,
        status: 'retired' as const,
        revision: current.revision + 1,
      });
      forms.set(formId, retired);
      return { status: 'ok', form: retired };
    },
    async copy(role, formId) {
      if (!canManageWorkspaceForms(role)) return result('forbidden');
      const current = forms.get(formId);
      if (current === undefined) return result('missing');
      const sectionIds = new Map(
        current.sections.map((section, index) => [
          section.id,
          `section-${index + 1}`,
        ]),
      );
      const copied: StaffFormDraft = {
        ...current,
        id: `mock-form-${nextId++}`,
        status: 'draft',
        revision: 0,
        sections: current.sections.map((section, index) => ({
          ...section,
          id: `section-${index + 1}`,
        })),
        questions: current.questions.map((question, index) => ({
          ...question,
          id: `question-${index + 1}`,
          sectionId: sectionIds.get(question.sectionId) ?? question.sectionId,
        })),
      };
      versionRoots.set(copied.id, versionRoots.get(formId) ?? formId);
      forms.set(copied.id, copied);
      return { status: 'ok', form: copied };
    },
    async selectDefaultOnboardingForm(role, formId) {
      if (!canManageWorkspaceForms(role)) return { status: 'forbidden' };
      const selected = forms.get(formId);
      if (selected === undefined || selected.status === 'retired')
        return { status: 'missing' };
      defaultOnboardingFormId = formId;
      return { status: 'ok' };
    },
  };
}

export function createNeutralFormsBrandSource(): FormsWorkspaceBrandSource {
  return {
    async resolvePublishedColor() {
      return null;
    },
  };
}

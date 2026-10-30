import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FormBuilder } from '../../components/forms/FormBuilder';
import { StaffSlaAlerts } from '../../components/forms/StaffSlaAlerts';
import { getMessages } from '../../lib/i18n';
import { createMockFormsStaffAdapter } from '../../lib/forms/mock-staff-adapter';
import {
  canManageWorkspaceForms,
  canAddQuestion,
  getClientReminderSchedule,
  resolveClientDeadlineDays,
} from '../../lib/forms/staff-policy';

describe('F15 staff preview policy', () => {
  it('keeps workspace builder permission to PO, WO, and Trainer', () => {
    expect(canManageWorkspaceForms('po')).toBe(true);
    expect(canManageWorkspaceForms('wo')).toBe(true);
    expect(canManageWorkspaceForms('trainer')).toBe(true);
    expect(canManageWorkspaceForms('sales')).toBe(false);
  });

  it('enforces 20 questions per section and 60 per form', () => {
    const questions = Array.from({ length: 20 }, (_, index) => ({
      id: `question-${index}`,
      sectionId: index < 20 ? 'first' : 'second',
      type: 'shortText' as const,
      required: false,
    }));
    expect(canAddQuestion(questions, 'first')).toBe(false);
    expect(canAddQuestion(questions.slice(0, 19), 'first')).toBe(true);
    const sixty = Array.from({ length: 60 }, (_, index) => ({
      id: `question-${index}`,
      sectionId: `section-${Math.floor(index / 20)}`,
      type: 'shortText' as const,
      required: false,
    }));
    expect(canAddQuestion(sixty, 'section-3')).toBe(false);
  });

  it('uses three Cairo calendar days for the default onboarding form and bounds other forms', () => {
    expect(
      resolveClientDeadlineDays({
        isDefaultOnboardingForm: true,
        configuredDays: 9,
      }),
    ).toBe(3);
    expect(resolveClientDeadlineDays({ isDefaultOnboardingForm: false })).toBe(
      3,
    );
    expect(
      resolveClientDeadlineDays({
        isDefaultOnboardingForm: false,
        configuredDays: 1,
      }),
    ).toBe(1);
    expect(
      resolveClientDeadlineDays({
        isDefaultOnboardingForm: false,
        configuredDays: 14,
      }),
    ).toBe(14);
    expect(() =>
      resolveClientDeadlineDays({
        isDefaultOnboardingForm: false,
        configuredDays: 0,
      }),
    ).toThrow();
    expect(() =>
      resolveClientDeadlineDays({
        isDefaultOnboardingForm: false,
        configuredDays: 15,
      }),
    ).toThrow();
  });

  it('keeps client-late escalation independent of Trainer-late delivery rules', () => {
    const assigned = getClientReminderSchedule(
      '2026-11-03T20:59:59.999Z',
      true,
    );
    const unassigned = getClientReminderSchedule(
      '2026-11-03T20:59:59.999Z',
      false,
    );
    expect(assigned.firstAt).toBe('2026-11-04T20:59:59.999Z');
    expect(assigned.firstAudience).toBe('trainer');
    expect(assigned.escalationAt).toBe('2026-11-05T20:59:59.999Z');
    expect(unassigned.firstAudience).toBe('owners');
    expect(assigned.trainerLatePolicy).toBe('d03');
  });
});

describe('staff builder and assignment views', () => {
  it('keeps the in-memory adapter behind the interface and guards role, bounds, and lifecycle', async () => {
    const adapter = createMockFormsStaffAdapter();
    const form = {
      id: 'test-form',
      title: { en: 'Example', ar: 'مثال' },
      sections: [{ id: 'section-1', title: { en: 'General', ar: 'عام' } }],
      questions: [
        {
          id: 'question-1',
          sectionId: 'section-1',
          type: 'shortText' as const,
          required: false,
          charLimit: 150,
          label: { en: 'Question', ar: 'سؤال' },
        },
      ],
      deadlineDays: 3,
      status: 'draft' as const,
      revision: 0,
    };
    expect((await adapter.saveDraft('sales', form)).status).toBe('forbidden');
    expect(
      (await adapter.saveDraft('trainer', { ...form, deadlineDays: 15 }))
        .status,
    ).toBe('invalid');
    const saved = await adapter.saveDraft('trainer', form);
    expect(saved.status).toBe('ok');
    const published = await adapter.publish('trainer', form.id);
    expect(published.status).toBe('ok');
    const copied = await adapter.copy('trainer', form.id);
    expect(copied.status).toBe('ok');
    if (copied.status === 'ok') {
      expect(copied.form.status).toBe('draft');
      expect(copied.form.id).not.toBe(form.id);
    }
    expect((await adapter.retire('trainer', form.id)).status).toBe('ok');
  });

  it('provides Your First Step as an ordinary editable default form with optional empty starter content', async () => {
    const adapter = createMockFormsStaffAdapter();
    const snapshot = await adapter.load();
    expect(snapshot.defaultOnboardingFormId).toBe('your-first-step');
    const draft = snapshot.forms.find((item) => item.id === 'your-first-step');
    expect(draft).toMatchObject({
      title: {
        en: 'Your First Step',
        ar: getMessages('ar')['forms.defaultOnboardingForm'],
      },
      sections: [],
      questions: [],
      status: 'draft',
    });
    expect(snapshot.forms).toHaveLength(1);
  });

  it('allows a Workspace Owner to edit, empty, replace and select an ordinary form without a catalog lock', async () => {
    const adapter = createMockFormsStaffAdapter();
    const snapshot = await adapter.load();
    const first = snapshot.forms[0]!;
    const edited = await adapter.saveDraft('wo', {
      ...first,
      title: { ...first.title, en: 'Editable onboarding' },
    });
    expect(edited.status).toBe('ok');
    if (edited.status !== 'ok') return;

    const emptied = await adapter.saveDraft('wo', {
      ...edited.form,
      sections: [],
      questions: [],
    });
    expect(emptied.status).toBe('ok');
    if (emptied.status !== 'ok') return;
    expect(emptied.form.questions).toEqual([]);

    const replacement = {
      ...emptied.form,
      id: 'replacement-onboarding',
      title: { en: 'Replacement', ar: '' },
      revision: 0,
    };
    const savedReplacement = await adapter.saveDraft('wo', replacement);
    expect(savedReplacement.status).toBe('ok');
    if (savedReplacement.status !== 'ok') return;
    const selection = adapter as unknown as {
      selectDefaultOnboardingForm: (
        role: string,
        formId: string,
      ) => Promise<{ status: string }>;
    };
    expect(
      await selection.selectDefaultOnboardingForm('wo', replacement.id),
    ).toEqual({ status: 'ok' });
    expect((await adapter.load()).defaultOnboardingFormId).toBe(replacement.id);
  });

  it('denies Sales and unknown roles from changing or selecting onboarding forms', async () => {
    const adapter = createMockFormsStaffAdapter();
    const snapshot = await adapter.load();
    const form = snapshot.forms[0]!;
    const selection = adapter as unknown as {
      selectDefaultOnboardingForm: (
        role: string,
        formId: string,
      ) => Promise<{ status: string }>;
    };
    expect((await adapter.saveDraft('sales', form)).status).toBe('forbidden');
    expect(
      await selection.selectDefaultOnboardingForm('sales', form.id),
    ).toEqual({ status: 'forbidden' });
    expect(
      await selection.selectDefaultOnboardingForm('unknown', form.id),
    ).toEqual({ status: 'forbidden' });
  });

  it('renders the default form in the Builder list with its ordinary editable controls', async () => {
    const adapter = createMockFormsStaffAdapter();
    const snapshot = await adapter.load();
    const draft = snapshot.forms[0]!;
    const html = renderToStaticMarkup(
      createElement(FormBuilder, {
        locale: 'en',
        actorRole: 'wo',
        form: draft,
        allForms: snapshot.forms,
        defaultOnboardingFormId: snapshot.defaultOnboardingFormId,
        onChange: () => undefined,
        onCreate: () => undefined,
        onSelectForm: () => undefined,
        onSetDefaultOnboardingForm: () => undefined,
        onSave: () => undefined,
        onPublish: () => undefined,
        onRetire: () => undefined,
        onCopy: () => undefined,
        onIssue: () => undefined,
      }),
    );
    expect(html).toContain('English form name');
    expect(html).toContain('Arabic form name');
    expect(html).not.toContain('Mandatory Intake');
    expect(html).toContain('Your First Step');
  });

  it('shows separate client and Trainer lateness sections with mock-only labeling', async () => {
    const adapter = createMockFormsStaffAdapter();
    const snapshot = await adapter.load();
    const html = renderToStaticMarkup(
      createElement(StaffSlaAlerts, {
        locale: 'en',
        assignments: snapshot.assignments,
      }),
    );
    expect(html).toContain('Client submission alerts');
    expect(html).toContain('Trainer delivery alerts');
    expect(html).toContain('Mock preview');
  });
});

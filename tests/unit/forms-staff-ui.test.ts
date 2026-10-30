import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FormBuilder } from '../../components/forms/FormBuilder';
import { StaffSlaAlerts } from '../../components/forms/StaffSlaAlerts';
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

  it('keeps Mandatory Intake at three Cairo calendar days and bounds other forms', () => {
    expect(resolveClientDeadlineDays({ kind: 'mandatory' })).toBe(3);
    expect(resolveClientDeadlineDays({ kind: 'other' })).toBe(3);
    expect(
      resolveClientDeadlineDays({ kind: 'other', configuredDays: 1 }),
    ).toBe(1);
    expect(
      resolveClientDeadlineDays({ kind: 'other', configuredDays: 14 }),
    ).toBe(14);
    expect(() =>
      resolveClientDeadlineDays({ kind: 'other', configuredDays: 0 }),
    ).toThrow();
    expect(() =>
      resolveClientDeadlineDays({ kind: 'other', configuredDays: 15 }),
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

  it('starts with blank bilingual content instead of inventing Mandatory Intake questions', async () => {
    const adapter = createMockFormsStaffAdapter();
    const snapshot = await adapter.load();
    expect(snapshot.forms).toHaveLength(0);
    const draft = {
      id: 'blank-form',
      title: { en: '', ar: '' },
      sections: [],
      questions: [],
      deadlineDays: 3,
      status: 'draft' as const,
      revision: 0,
    };
    const html = renderToStaticMarkup(
      createElement(FormBuilder, {
        locale: 'en',
        actorRole: 'trainer',
        form: draft,
        allForms: [],
        onChange: () => undefined,
        onCreate: () => undefined,
        onSelectForm: () => undefined,
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
    expect(html).not.toContain('What would you like to work toward?');
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

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FormBuilder } from '../../components/forms/FormBuilder';
import {
  FormPreview,
  localizedFormCopy,
} from '../../components/forms/FormPreview';
import { createMockFormsStaffAdapter } from '../../lib/forms/mock-staff-adapter';
import type { StaffFormDraft } from '../../lib/forms/staff-contracts';

const draft: StaffFormDraft = {
  id: 'builder-form',
  title: { en: 'Intake draft', ar: 'مسودة الاستقبال' },
  sections: [{ id: 'nutrition', title: { en: 'Nutrition', ar: 'التغذية' } }],
  questions: [
    {
      id: 'N11',
      sectionId: 'nutrition',
      type: 'slider',
      required: true,
      validation: { min: 0, max: 10, step: 1 },
      labels: { minimum: 'Low', middle: 'Medium', maximum: 'High' },
      feedbackBands: [
        { min: 0, max: 2, text: 'Low feedback' },
        { min: 3, max: 10, text: 'Other feedback' },
      ],
      label: { en: 'Hunger', ar: 'الجوع' },
    },
    {
      id: 'N12',
      sectionId: 'nutrition',
      type: 'imageChoice',
      required: true,
      purpose: 'n12-series',
      choices: ['18'],
      assetReferences: ['/images/body-fat/female-18.webp'],
      label: { en: 'Reference', ar: 'مرجع' },
      optionLabels: [{ en: '18%', ar: '١٨٪' }],
    },
    {
      id: 'N07.meals',
      sectionId: 'nutrition',
      type: 'mealCount',
      required: true,
      choices: ['2', '3', '4', '5'],
      label: { en: 'Meals', ar: 'الوجبات' },
      optionLabels: [2, 3, 4, 5].map((meal) => ({
        en: String(meal),
        ar: String(meal),
      })),
    },
    {
      id: 'N07.timing',
      sectionId: 'nutrition',
      type: 'derivedChoice',
      required: false,
      choices: ['meal-1', 'meal-2', 'before-first', 'no-fixed-time'],
      derivedOptions: {
        sourceQuestionId: 'N07.meals',
        fixedChoices: ['before-first', 'no-fixed-time'],
      },
      label: { en: 'Training timing', ar: 'موعد التمرين' },
      optionLabels: [],
    },
    {
      id: 'notice',
      sectionId: 'nutrition',
      type: 'displayOnly',
      required: false,
      privacy: 'health',
      displayText: { en: 'Health notice', ar: 'تنبيه صحي' },
      label: { en: 'Notice', ar: 'تنبيه' },
    },
    {
      id: 'profile-name',
      sectionId: 'nutrition',
      type: 'profileText',
      required: false,
      profileField: 'fullName',
      label: { en: 'Full name', ar: 'الاسم الثلاثي' },
    },
    {
      id: 'age',
      sectionId: 'nutrition',
      type: 'computedAge',
      required: false,
      dateOfBirthField: 'dateOfBirth',
      label: { en: 'Age', ar: 'العمر' },
    },
    {
      id: 'weight',
      sectionId: 'nutrition',
      type: 'number',
      required: true,
      unit: { en: 'kg', ar: 'كجم' },
      validation: { min: 1, max: 300, step: 0.1 },
      label: { en: 'Weight', ar: 'الوزن' },
    },
  ],
  deadlineDays: 3,
  status: 'draft',
  revision: 0,
};

function builderMarkup(form: StaffFormDraft = draft, locale: 'en' | 'ar' = 'en') {
  return renderToStaticMarkup(
    createElement(FormBuilder, {
      locale,
      actorRole: 'trainer',
      form,
      allForms: [],
      defaultOnboardingFormId: null,
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
}

describe('S14 staff form Builder', () => {
  it('renders one selected question editor with a compact, localized outline', () => {
    const english = builderMarkup();
    expect(
      (english.match(/data-testid="question-outline-item"/gu) ?? []).length,
    ).toBe(draft.questions.length);
    expect(english.match(/data-testid="question-editor"/gu)).toHaveLength(1);
    expect(english).toContain('aria-expanded="true"');
    expect(english).toContain('Required');
    expect(english).toContain('Slider');

    const arabic = builderMarkup(draft, 'ar');
    expect(arabic).toContain('الجوع');
    expect(arabic).toContain('مطلوب');
    expect(arabic).toContain('مقياس منزلق');
  });

  it('exposes every engine field type and authoring action with localized names', () => {
    const html = builderMarkup();
    for (const type of [
      'slider',
      'imageChoice',
      'mealCount',
      'derivedChoice',
      'displayOnly',
      'profileText',
      'computedAge',
    ]) {
      expect(html).toContain(
        {
          slider: 'Slider',
          imageChoice: 'Image choice',
          mealCount: 'Number of meals',
          derivedChoice: 'Derived choice',
          displayOnly: 'Notice',
          profileText: 'Profile-bound text',
          computedAge: 'Calculated age',
        }[type],
      );
    }
    expect(html).toContain('Move question up');
    expect(html).toContain('Move question down');
    expect(html).toContain('Remove question');
    expect(html).toContain('Preview form');
    expect(html).toContain('Minimum value');
    expect(html).toContain('Maximum value');
    expect(html).toContain('Step');
    expect(html).toContain('Image reference');
    expect(html).toContain('Derived from question');
  });

  it('renders a read-only preview and resolves missing Arabic copy to English', () => {
    const html = renderToStaticMarkup(
      createElement(FormPreview, {
        locale: 'ar',
        form: draft,
        onBack: () => undefined,
        onPublish: () => undefined,
        busy: false,
      }),
    );
    expect(html).toContain('الجوع');
    expect(
      renderToStaticMarkup(
        createElement(FormPreview, {
          locale: 'en',
          form: draft,
          onBack: () => undefined,
          onPublish: () => undefined,
          busy: false,
        }),
      ),
    ).toContain('Hunger');
    expect(localizedFormCopy({ en: 'English label', ar: '' }, 'ar')).toBe(
      'English label',
    );
  });
});

describe('immutable mock publication', () => {
  it('keeps each published snapshot frozen and rejects edits to a published version', async () => {
    const adapter = createMockFormsStaffAdapter();
    const initial = await adapter.saveDraft('trainer', {
      ...draft,
      questions: [
        {
          id: 'question-1',
          sectionId: 'nutrition',
          type: 'shortText',
          required: false,
          charLimit: 150,
          label: { en: 'Question', ar: 'سؤال' },
        },
      ],
    });
    expect(initial.status).toBe('ok');
    const first = await adapter.publish('trainer', draft.id);
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') return;
    expect(Object.isFrozen(first.form)).toBe(true);
    expect(Object.isFrozen(first.form.questions)).toBe(true);
    expect(adapter.getPublishedVersions(draft.id)).toEqual([first.form]);

    const copied = await adapter.copy('trainer', draft.id);
    expect(copied.status).toBe('ok');
    if (copied.status !== 'ok') return;
    const editedCopy = await adapter.saveDraft('trainer', {
      ...copied.form,
      title: { ...copied.form.title, en: 'Revised intake' },
    });
    expect(editedCopy.status).toBe('ok');
    const second = await adapter.publish('trainer', copied.form.id);
    expect(second.status).toBe('ok');
    expect(adapter.getPublishedVersions(draft.id)).toHaveLength(2);
    expect(adapter.getPublishedVersions(draft.id)[0]?.title.en).toBe(
      'Intake draft',
    );
    expect(adapter.getPublishedVersions(draft.id)[1]?.title.en).toBe(
      'Revised intake',
    );

    const attemptedEdit = await adapter.saveDraft('trainer', {
      ...first.form,
      status: 'draft',
      title: { ...first.form.title, en: 'Changed published content' },
    });
    expect(attemptedEdit.status).toBe('forbidden');
    expect(adapter.getPublishedVersions(draft.id)[0]?.title.en).toBe(
      'Intake draft',
    );
  });
});

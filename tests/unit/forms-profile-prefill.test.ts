import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QuestionFlow } from '../../components/forms/QuestionFlow';
import { buildProfilePrefill } from '../../lib/forms/profile-prefill';

const adapter = {
  reloadDraft: vi.fn(async () => ({
    status: 'loaded' as const,
    revision: 0,
    answers: {},
  })),
  saveDraft: vi.fn(async () => ({ status: 'saved' as const, revision: 1 })),
  submit: vi.fn(async () => ({ status: 'submitted' as const })),
  correct: vi.fn(async () => ({ status: 'saved' as const, revision: 2 })),
};

const questions = [
  {
    id: 'B01',
    sectionId: 'basic',
    type: 'profileText' as const,
    required: false,
    profileField: 'fullName' as const,
  },
  {
    id: 'B02',
    sectionId: 'basic',
    type: 'computedAge' as const,
    required: false,
    dateOfBirthField: 'dateOfBirth' as const,
  },
];

describe('client intake signup profile prefill', () => {
  it('binds the approved question fields to the signup name and computes Cairo age', () => {
    expect(
      buildProfilePrefill(
        questions,
        { fullName: 'Signed client full name', dateOfBirth: '2000-10-31' },
        new Date('2026-10-30T22:30:00.000Z'),
      ),
    ).toEqual({ B01: 'Signed client full name', B02: '26' });
  });

  it('uses birthday today and the day before boundary in Cairo', () => {
    const profile = {
      fullName: 'Signed client full name',
      dateOfBirth: '2000-10-31',
    };
    expect(
      buildProfilePrefill(
        questions,
        profile,
        new Date('2026-10-30T21:30:00.000Z'),
      ),
    ).toEqual({ B01: profile.fullName, B02: '25' });
    expect(
      buildProfilePrefill(
        questions,
        profile,
        new Date('2026-10-30T22:30:00.000Z'),
      ),
    ).toEqual({ B01: profile.fullName, B02: '26' });
  });

  it('only binds declared read-only profile fields and tolerates a missing DOB', () => {
    const expanded = [
      ...questions,
      {
        id: 'custom',
        sectionId: 'basic',
        type: 'shortText' as const,
        required: false,
      },
    ];
    expect(
      buildProfilePrefill(
        expanded,
        { fullName: 'Signed client full name', dateOfBirth: null },
        new Date('2026-10-30T22:30:00.000Z'),
      ),
    ).toEqual({ B01: 'Signed client full name' });
  });
});

it('shows profile name and computed age in read-only outputs, while authored text remains editable', () => {
  const uiQuestions = [
    {
      id: 'B01',
      sectionId: 'basic',
      type: 'profileText' as const,
      required: false,
      profileField: 'fullName' as const,
      title: { en: 'Full name', ar: 'الاسم الثلاثي' },
    },
    {
      id: 'B02',
      sectionId: 'basic',
      type: 'computedAge' as const,
      required: false,
      dateOfBirthField: 'dateOfBirth' as const,
      title: { en: 'Age', ar: 'العمر' },
    },
    {
      id: 'goal',
      sectionId: 'basic',
      type: 'shortText' as const,
      required: false,
      title: { en: 'Goal', ar: '' },
    },
  ];
  const nameHtml = renderToStaticMarkup(
    createElement(QuestionFlow, {
      locale: 'en',
      questions: [uiQuestions[0]!],
      profileValues: { B01: 'Signup Full Name' },
      adapter,
      assignmentId: 'self-name',
    }),
  );
  const ageHtml = renderToStaticMarkup(
    createElement(QuestionFlow, {
      locale: 'en',
      questions: [uiQuestions[1]!],
      profileValues: { B02: '25' },
      adapter,
      assignmentId: 'self-age',
    }),
  );
  const editableHtml = renderToStaticMarkup(
    createElement(QuestionFlow, {
      locale: 'en',
      questions: [uiQuestions[2]!],
      adapter,
      assignmentId: 'editable-goal',
    }),
  );
  expect(nameHtml).toContain('Signup Full Name');
  expect(nameHtml).toContain('<output');
  expect(nameHtml).not.toContain('<input');
  expect(ageHtml).toContain('dir="ltr">25</bdi>');
  expect(ageHtml).toContain('<output');
  expect(ageHtml).not.toContain('<input');
  expect(editableHtml).toContain('type="text"');
});

it('starts at the first applicable question in authored order, including optional read-only bindings', () => {
  const uiQuestions = [
    {
      id: 'B01',
      sectionId: 'basic',
      type: 'profileText' as const,
      required: false,
      profileField: 'fullName' as const,
      title: { en: 'Full name', ar: 'الاسم الثلاثي' },
    },
    {
      id: 'B02',
      sectionId: 'basic',
      type: 'computedAge' as const,
      required: false,
      dateOfBirthField: 'dateOfBirth' as const,
      title: { en: 'Age', ar: 'العمر' },
    },
    {
      id: 'goal',
      sectionId: 'basic',
      type: 'shortText' as const,
      required: true,
      title: { en: 'Goal', ar: '' },
    },
  ];
  const html = renderToStaticMarkup(
    createElement(QuestionFlow, {
      locale: 'en',
      questions: uiQuestions,
      profileValues: { B01: 'Signup Full Name', B02: '25' },
      adapter,
      assignmentId: 'authored-order',
    }),
  );
  expect(html).toContain('<h2>Full name</h2>');
  expect(html).toContain('Signup Full Name');
  expect(html).not.toContain('<h2>Goal</h2>');
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { QuestionFlow } from '../../components/forms/QuestionFlow';

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

it('shows profile name and computed age in read-only outputs, while authored text remains editable', () => {
  const questions = [
    {
      id: 'B01',
      sectionId: 'basic',
      type: 'profileText' as const,
      required: false,
      profileField: 'fullName' as const,
      title: { en: 'Full name', ar: '' },
    },
    {
      id: 'B02',
      sectionId: 'basic',
      type: 'computedAge' as const,
      required: false,
      dateOfBirthField: 'dateOfBirth' as const,
      title: { en: 'Age', ar: '' },
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
      questions: [questions[0]!],
      profileValues: { B01: 'Signup Full Name' },
      adapter,
      assignmentId: 'self-name',
    }),
  );
  const ageHtml = renderToStaticMarkup(
    createElement(QuestionFlow, {
      locale: 'en',
      questions: [questions[1]!],
      profileValues: { B02: '25' },
      adapter,
      assignmentId: 'self-age',
    }),
  );
  const editableHtml = renderToStaticMarkup(
    createElement(QuestionFlow, {
      locale: 'en',
      questions: [questions[2]!],
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

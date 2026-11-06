import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  QuestionFlow,
  type LabeledQuestion,
} from '../../components/forms/QuestionFlow';
import { TextAnswerField } from '../../components/forms/TextAnswerField';
import { getMessages } from '../../lib/i18n';
import {
  answersForBudgetSelection,
  applicableClientAnswers,
  setClientAnswer,
} from '../../lib/forms/client-answer-state';

const adapter = {
  reloadDraft: vi.fn(async () => ({
    status: 'loaded' as const,
    revision: 1,
    answers: {},
  })),
  reloadSubmitted: vi.fn(async () => ({
    status: 'loaded' as const,
    revision: 2,
    answers: {},
  })),
  saveDraft: vi.fn(async () => ({ status: 'saved' as const, revision: 2 })),
  submit: vi.fn(async () => ({ status: 'submitted' as const })),
  correct: vi.fn(async () => ({ status: 'saved' as const, revision: 3 })),
};

const questions = [
  {
    id: 'injury-yes',
    sectionId: 'health',
    type: 'boolean' as const,
    required: true,
    title: { en: 'Do you have an injury?', ar: 'هل لديك إصابة؟' },
  },
  {
    id: 'old-detail',
    sectionId: 'health',
    type: 'longText' as const,
    required: true,
    title: { en: 'Tell us more', ar: 'أخبرنا بالمزيد' },
    when: {
      mode: 'all' as const,
      conditions: [
        { questionId: 'injury-yes', operator: 'equals' as const, value: true },
      ],
    },
  },
];
const starterQuestions = (
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'lib/forms/s14-starter-content.json'),
      'utf8',
    ),
  ).questions as Array<LabeledQuestion & { label: { en: string; ar: string } }>
).map(({ label, ...question }) => ({ ...question, title: label }));

describe('QuestionFlow', () => {
  it('isolates Arabic T03 and dynamic N07 Western digits with Bidi', () => {
    const t03 = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'ar',
        questions: starterQuestions.filter((question) => question.id === 'T03'),
        adapter,
        assignmentId: 'arabic-copy',
      }),
    );
    expect(t03).toContain('<bdi dir="ltr">2</bdi>');
    expect(t03).toContain('<bdi dir="ltr">6</bdi>');
    expect(getMessages('ar')['forms.afterMealNumber']).toBe(
      'الوجبة رقم {number}',
    );
  });

  it('localizes correction history question and option labels', () => {
    const t03 = starterQuestions.find((question) => question.id === 'T03')!;
    const html = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'en',
        questions: [t03],
        adapter,
        assignmentId: 'history-copy',
        initialAnswers: { T03: '2' },
        initialState: 'submitted',
        history: [{ version: 1, answers: { T03: '2' } }],
      }),
    );
    expect(html).toContain(
      '<dt>How many days a week would you like to train?</dt>',
    );
    expect(html).toContain('<dd>2 days</dd>');
  });

  it('keeps existing answers when applicability cannot be evaluated', () => {
    const malformedQuestions = [
      {
        ...questions[0]!,
        unknownAuthoredField: true,
      },
    ];
    const answers = { 'injury-yes': true, unrelated: 'keep me' };
    expect(applicableClientAnswers(malformedQuestions, answers)).toEqual(
      answers,
    );
  });

  it('removes an answer when the client clears a numeric control', () => {
    expect(
      setClientAnswer({ weight: 0, other: 'preserved' }, 'weight', undefined),
    ).toEqual({ other: 'preserved' });
  });

  it('hides and erases a now-inapplicable answer from the client flow', () => {
    const html = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'en',
        questions,
        adapter,
        assignmentId: 'fixture',
        initialAnswers: {
          'injury-yes': false,
          'old-detail': 'must disappear',
        },
        initialState: 'ready',
      }),
    );
    expect(html).not.toContain('Tell us more');
    expect(html).not.toContain('must disappear');
    expect(
      applicableClientAnswers(questions, {
        'injury-yes': false,
        'old-detail': 'must disappear',
      }),
    ).not.toHaveProperty('old-detail');
  });

  it('shows a required question when submitting with a missing answer', () => {
    const html = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'en',
        questions: [questions[0]!],
        adapter,
        assignmentId: 'fixture',
        initialAnswers: {},
        initialState: 'missing-required',
      }),
    );
    expect(html).toContain('required');
    expect(html).toContain('Do you have an injury?');
  });

  it('renders approved builder answer controls and localized display copy', () => {
    const displayOnly = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'en',
        questions: [
          {
            id: 'note',
            sectionId: 's',
            type: 'displayOnly',
            required: false,
            title: { en: 'Heading', ar: 'عنوان' },
            displayText: { en: 'Read this note', ar: 'اقرأ هذه الملاحظة' },
          },
        ],
        adapter,
        assignmentId: 'display-only',
      }),
    );
    expect(displayOnly).toContain('Read this note');

    const localizedChoice = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'en',
        questions: [
          {
            id: 'choice',
            sectionId: 's',
            type: 'singleChoice',
            required: true,
            title: { en: 'Choice', ar: 'اختيار' },
            choices: ['raw'],
            optionLabels: [{ en: 'Localized option', ar: 'خيار' }],
          },
        ],
        adapter,
        assignmentId: 'single-choice',
      }),
    );
    expect(localizedChoice).toContain('Localized option');
    expect(localizedChoice).not.toContain('>raw</label>');

    const slider = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'en',
        questions: [
          {
            id: 'slider',
            sectionId: 's',
            type: 'slider',
            required: true,
            title: { en: 'Score', ar: 'التقييم' },
            labels: { minimum: 'Low', middle: 'Mid', maximum: 'High' },
            validation: { min: 0, max: 10, step: 1 },
            feedbackBands: [{ min: 0, max: 10, text: 'Score feedback' }],
          },
        ],
        adapter,
        assignmentId: 'slider',
      }),
    );
    expect(slider).toContain('type="range"');
    expect(slider).toContain('Score feedback');
  });

  it('renders the approved N07 English timing strings and canonical Arabic labels', () => {
    const timingQuestion = starterQuestions.find(
      (question) => question.id === 'N07.training_timing',
    )!;
    const mealCountQuestion = starterQuestions.find(
      (question) => question.id === 'N07.meal_count',
    )!;
    const questions = [timingQuestion, mealCountQuestion];
    const html = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'en',
        questions,
        adapter,
        assignmentId: 'n07-approved-copy',
        initialAnswers: { 'N07.meal_count': '3' },
      }),
    );
    expect(html).toContain('After which meal would you like to train?');
    expect(html).toContain('After meal <bdi dir="ltr">1</bdi>');
    expect(html).toContain('After meal <bdi dir="ltr">2</bdi>');
    expect(html).toContain('After meal <bdi dir="ltr">3</bdi>');
    expect(html).not.toContain('After meal 4');
    expect(html).toContain('Before the first meal');
    expect(html).toContain('I don&#x27;t have a fixed time');

    const arabicHtml = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'ar',
        questions,
        adapter,
        assignmentId: 'n07-approved-copy-ar',
        initialAnswers: { 'N07.meal_count': '3' },
      }),
    );
    const mealNumberTemplate = getMessages('ar')['forms.afterMealNumber'];
    expect(arabicHtml).toContain(
      mealNumberTemplate.replace('{number}', '<bdi dir="ltr">1</bdi>'),
    );
    expect(arabicHtml).toContain(
      mealNumberTemplate.replace('{number}', '<bdi dir="ltr">3</bdi>'),
    );
    expect(arabicHtml).toContain(timingQuestion.title.ar);
    const noFixedIndex = timingQuestion.choices?.indexOf('no-fixed-time') ?? -1;
    expect(arabicHtml).toContain(
      timingQuestion.optionLabels?.[noFixedIndex]?.ar ?? '',
    );
  });

  it('renders canonical Arabic budget chips and prunes values when budget changes', () => {
    const budgetQuestion = starterQuestions.find(
      (question) => question.id === 'N08',
    )!;
    const foodQuestion = starterQuestions.find(
      (question) => question.id === 'N08.foods',
    )!;
    const budgetQuestions: LabeledQuestion[] = [
      budgetQuestion,
      foodQuestion,
      {
        id: 'N09',
        sectionId: 'nutrition',
        type: 'shortText',
        required: false,
        title: { en: 'Next question', ar: '' },
      },
    ];
    const html = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'ar',
        questions: budgetQuestions,
        adapter,
        assignmentId: 'n08-budget',
        initialAnswers: { N08: 'medium', 'N08.foods': ['medium:chicken'] },
      }),
    );
    expect(html).toContain(foodQuestion.optionLabels?.[5]?.ar ?? '');
    expect(html).toContain('type="checkbox" checked=""');
    expect(html).not.toContain('Next question');
    expect(
      answersForBudgetSelection(
        { N08: 'low', 'N08.foods': ['medium:chicken'] },
        'low',
      ),
    ).not.toHaveProperty('N08.foods');
  });

  it('keeps submitted history readable and removes correction after relationship end', () => {
    const html = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'en',
        questions: [questions[0]!],
        adapter,
        assignmentId: 'fixture',
        initialAnswers: { 'injury-yes': true },
        initialState: 'submitted',
        history: [
          {
            version: 1,
            createdAt: '2026-10-29T10:00:00Z',
            answers: {
              'injury-yes': true,
              'old-detail': 'must disappear',
            },
          },
        ],
        relationshipActive: false,
      }),
    );
    expect(html).toContain('Answer history');
    expect(html).toContain('Corrections are unavailable');
    expect(html).not.toContain('must disappear');
    expect(html).not.toContain('Correct submitted answers</button>');
  });

  it('exposes a reload action while a stale draft conflict blocks editing', () => {
    const html = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'en',
        questions: [questions[0]!],
        adapter,
        assignmentId: 'fixture',
        initialAnswers: {},
        initialState: 'conflict',
      }),
    );
    expect(html).toContain('This draft changed elsewhere');
    expect(html).toContain('Reload latest draft');
    expect(html).toContain('disabled=""');
  });

  it('keeps an over-limit text answer editable and exposes the field error', () => {
    const html = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'en',
        questions: [
          {
            id: 'answer',
            sectionId: 'health',
            type: 'shortText',
            required: true,
            title: { en: 'Answer', ar: 'الإجابة' },
          },
        ],
        adapter,
        assignmentId: 'fixture',
        initialAnswers: { answer: 'x'.repeat(151) },
      }),
    );
    expect(html).toContain('This answer exceeds the character limit.');
    expect(html).toContain('value="');
  });

  it('shows health-data context only beside a health-related question', () => {
    const healthQuestion = {
      id: 'health-detail',
      sectionId: 'health',
      type: 'longText' as const,
      required: false,
      privacy: 'health' as const,
      title: { en: 'Health question example', ar: '' },
    };
    const healthHtml = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'en',
        questions: [healthQuestion],
        adapter,
        assignmentId: 'health-context',
      }),
    );
    expect(healthHtml).toContain('About your health data');
    expect(healthHtml.indexOf('About your health data')).toBeLessThan(
      healthHtml.indexOf('<label'),
    );

    const ordinaryHtml = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'en',
        questions: [{ ...healthQuestion, privacy: undefined }],
        adapter,
        assignmentId: 'ordinary-context',
      }),
    );
    expect(ordinaryHtml).not.toContain('About your health data');
  });
});

it('counts an emoji as one Unicode code point in the answer counter', () => {
  const html = renderToStaticMarkup(
    createElement(TextAnswerField, {
      kind: 'shortText',
      label: 'Answer',
      value: '😀',
      onChange: vi.fn(),
      locale: 'en',
    }),
  );
  expect(html).toContain('Characters:');
  expect(html).toContain('of');
  expect(html).toMatch(/149<\/bdi> remaining/);
  expect(html).toContain('aria-live="polite"');
});

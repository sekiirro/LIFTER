import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QuestionFlow } from '../../components/forms/QuestionFlow';
import { TextAnswerField } from '../../components/forms/TextAnswerField';
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

describe('QuestionFlow', () => {
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

  it('renders the PO-approved N07 English timing question and dynamic option wording', () => {
    const html = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'en',
        questions: [
          {
            id: 'N07.training_timing',
            sectionId: 'nutrition',
            type: 'derivedChoice',
            required: false,
            title: {
              en: 'After which meal would you like to train?',
              ar: 'ØªØ­Ø¨ ØªÙ…Ø±ÙŠÙ†Ùƒ ÙŠÙƒÙˆÙ† Ø¨Ø¹Ø¯ Ø§Ù„ÙˆØ¬Ø¨Ø© Ø§Ù„ÙƒØ§Ù…ØŸ',
            },
            choices: [
              'meal-1',
              'meal-2',
              'meal-3',
              'meal-4',
              'meal-5',
              'before-first',
              'no-fixed-time',
            ],
            optionLabels: [
              { en: '', ar: 'ÙˆØ¬Ø¨Ø©' },
              { en: '', ar: 'ÙˆØ¬Ø¨Ø©' },
              { en: '', ar: 'ÙˆØ¬Ø¨Ø©' },
              { en: '', ar: 'ÙˆØ¬Ø¨Ø©' },
              { en: '', ar: 'ÙˆØ¬Ø¨Ø©' },
              { en: 'Before the first meal', ar: 'Ù‚Ø¨Ù„ Ø£ÙˆÙ„ ÙˆØ¬Ø¨Ø©' },
              {
                en: "I don't have a fixed time",
                ar: 'Ù…Ø¹Ù†Ø¯ÙŠØ´ Ù…ÙŠØ¹Ø§Ø¯ Ø«Ø§Ø¨Øª',
              },
            ],
            derivedOptions: {
              sourceQuestionId: 'N07.meal_count',
              fixedChoices: ['before-first', 'no-fixed-time'],
            },
          },
          {
            id: 'N07.meal_count',
            sectionId: 'nutrition',
            type: 'mealCount',
            required: false,
            title: { en: '', ar: '' },
            choices: ['2', '3', '4', '5'],
          },
        ],
        adapter,
        assignmentId: 'n07-approved-copy',
        initialAnswers: { 'N07.meal_count': '3' },
      }),
    );
    expect(html).toContain('After which meal would you like to train?');
    expect(html).toContain('After meal 1');
    expect(html).toContain('After meal 2');
    expect(html).toContain('After meal 3');
    expect(html).not.toContain('After meal 4');
    expect(html).toContain('Before the first meal');
    expect(html).toContain('I don&#x27;t have a fixed time');

    const arabicHtml = renderToStaticMarkup(
      createElement(QuestionFlow, {
        locale: 'ar',
        questions: [
          {
            id: 'N07.training_timing',
            sectionId: 'nutrition',
            type: 'derivedChoice',
            required: false,
            title: { en: '', ar: 'ØªØ­Ø¨ ØªÙ…Ø±ÙŠÙ†Ùƒ' },
            choices: ['meal-1', 'meal-2', 'before-first', 'no-fixed-time'],
            optionLabels: [
              { en: '', ar: 'ÙˆØ¬Ø¨Ø©' },
              { en: '', ar: 'ÙˆØ¬Ø¨Ø©' },
              { en: '', ar: 'Ù‚Ø¨Ù„ Ø£ÙˆÙ„ ÙˆØ¬Ø¨Ø©' },
              { en: '', ar: 'Ù…Ø¹Ù†Ø¯ÙŠØ´ Ù…ÙŠØ¹Ø§Ø¯ Ø«Ø§Ø¨Øª' },
            ],
            derivedOptions: {
              sourceQuestionId: 'N07.meal_count',
              fixedChoices: ['before-first', 'no-fixed-time'],
            },
          },
          {
            id: 'N07.meal_count',
            sectionId: 'nutrition',
            type: 'mealCount',
            required: false,
            title: { en: '', ar: '' },
            choices: ['2', '3', '4', '5'],
          },
        ],
        adapter,
        assignmentId: 'n07-approved-copy-ar',
        initialAnswers: { 'N07.meal_count': '3' },
      }),
    );
    expect(arabicHtml).toContain('وجبة 1');
    expect(arabicHtml).toContain('وجبة 3');
  });

  it('renders budget chips within the N08 question and prunes values when budget changes', () => {
    const budgetQuestions = [
      {
        id: 'N08',
        sectionId: 'nutrition',
        type: 'singleChoice' as const,
        required: false,
        title: { en: 'What’s your food budget?', ar: 'Ù…ÙŠØ²Ø§Ù†ÙŠØªÙƒ' },
        choices: ['low', 'medium', 'high'],
        optionLabels: [
          { en: '', ar: 'Ù…ÙŠØ²Ø§Ù†ÙŠØ© Ù‚Ù„ÙŠÙ„Ø©' },
          { en: '', ar: 'Ù…ÙŠØ²Ø§Ù†ÙŠØ© Ù…ØªÙˆØ³Ø·Ø©' },
          { en: '', ar: 'Ù…ÙŠØ²Ø§Ù†ÙŠØ© Ø¹Ø§Ù„ÙŠØ©' },
        ],
      },
      {
        id: 'N08.foods',
        sectionId: 'nutrition',
        type: 'multiChoice' as const,
        required: false,
        title: { en: "What's your food budget?", ar: 'Ù…ÙŠØ²Ø§Ù†ÙŠØªÙƒ' },
        choices: ['low:egg', 'medium:chicken', 'high:salmon'],
        optionLabels: [
          { en: '', ar: 'Ø¨ÙŠØ¶' },
          { en: '', ar: 'ÙØ±Ø§Ø®' },
          { en: '', ar: 'Ø³Ø§Ù„Ù…ÙˆÙ†' },
        ],
        when: {
          mode: 'any' as const,
          conditions: [
            { questionId: 'N08', operator: 'equals' as const, value: 'low' },
            {
              questionId: 'N08',
              operator: 'equals' as const,
              value: 'medium',
            },
            { questionId: 'N08', operator: 'equals' as const, value: 'high' },
          ],
        },
      },
      {
        id: 'N09',
        sectionId: 'nutrition',
        type: 'shortText' as const,
        required: false,
        title: { en: 'Next question', ar: 'Ù…Ø§ Ø¨Ø¹Ø¯Ù‡' },
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
    expect(html).toContain('ÙØ±Ø§Ø®');
    expect(html).not.toContain('Ø¨ÙŠØ¶');
    expect(html).not.toContain('Ø³Ø§Ù„Ù…ÙˆÙ†');
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
});

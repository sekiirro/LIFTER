import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QuestionFlow } from '../../components/forms/QuestionFlow';
import { TextAnswerField } from '../../components/forms/TextAnswerField';
import {
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

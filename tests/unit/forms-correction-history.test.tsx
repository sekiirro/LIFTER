import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CorrectionHistory } from '../../components/forms/CorrectionHistory';
import type { LabeledQuestion } from '../../components/forms/QuestionFlow';
import { getMessages } from '../../lib/i18n';

const questions: LabeledQuestion[] = [
  {
    id: 'consent',
    sectionId: 'consent',
    type: 'boolean',
    required: false,
    title: { en: 'Consent', ar: 'الموافقة' },
  },
  {
    id: 'required-goal',
    sectionId: 'goal',
    type: 'shortText',
    required: true,
    title: { en: 'Goal', ar: 'الهدف' },
  },
];

describe('correction history answer labels and clear answer control', () => {
  it('localizes boolean values and preserves existing string values', () => {
    const html = renderToStaticMarkup(
      createElement(CorrectionHistory, {
        locale: 'en',
        questions,
        entries: [
          { version: 1, answers: { consent: true } },
          { version: 2, answers: { consent: false } },
          { version: 3, answers: { consent: 'recorded value' } },
        ],
      }),
    );
    const messages = getMessages('en');
    expect(html).toContain(`>${messages['forms.yes']}<`);
    expect(html).toContain(`>${messages['forms.no']}<`);
    expect(html).toContain('recorded value');
  });

  it('uses Arabic boolean labels and preserves numeric display', () => {
    const html = renderToStaticMarkup(
      createElement(CorrectionHistory, {
        locale: 'ar',
        questions,
        entries: [
          { version: 1, answers: { consent: true } },
          { version: 2, answers: { consent: false } },
          { version: 3, answers: { consent: 42 } },
        ],
      }),
    );
    const messages = getMessages('ar');
    expect(html).toContain(`>${messages['forms.yes']}<`);
    expect(html).toContain(`>${messages['forms.no']}<`);
    expect(html).toContain('٤٢');
  });

  it('renders clear-answer control on latest revision with exact PO-approved EN copy and accessible name', () => {
    const onClearAnswer = vi.fn();
    const html = renderToStaticMarkup(
      createElement(CorrectionHistory, {
        locale: 'en',
        questions,
        entries: [
          { version: 1, answers: { consent: true } },
          { version: 2, answers: { consent: false } },
        ],
        onClearAnswer,
      }),
    );
    const messages = getMessages('en');
    expect(messages['forms.clearAnswer']).toBe('Clear answer');
    expect(html).toContain('>Clear answer<');
    expect(html).toContain('aria-label="Clear answer: Consent"');
  });

  it('renders clear-answer control on latest revision with exact PO-approved AR copy and accessible name', () => {
    const onClearAnswer = vi.fn();
    const html = renderToStaticMarkup(
      createElement(CorrectionHistory, {
        locale: 'ar',
        questions,
        entries: [
          { version: 1, answers: { consent: true } },
          { version: 2, answers: { consent: false } },
        ],
        onClearAnswer,
      }),
    );
    const messages = getMessages('ar');
    expect(messages['forms.clearAnswer']).toBe('امسح الإجابة');
    expect(html).toContain('>امسح الإجابة<');
    expect(html).toContain('aria-label="امسح الإجابة: الموافقة"');
  });

  it('disables clear-answer button on required answers per FR-013 / SC-029', () => {
    const onClearAnswer = vi.fn();
    const html = renderToStaticMarkup(
      createElement(CorrectionHistory, {
        locale: 'en',
        questions,
        entries: [
          {
            version: 1,
            answers: { consent: true, 'required-goal': 'Build muscle' },
          },
        ],
        onClearAnswer,
      }),
    );
    // Required question button must be disabled
    expect(html).toContain('aria-label="Clear answer: Goal"');
    expect(html).toMatch(
      /<button[^>]*aria-label="Clear answer: Goal"[^>]*disabled=""/,
    );
    // Non-required question button must NOT be disabled
    expect(html).toContain('aria-label="Clear answer: Consent"');
    expect(html).not.toMatch(
      /<button[^>]*aria-label="Clear answer: Consent"[^>]*disabled/,
    );
  });

  it('disables clear-answer button when relationship is inactive per FR-013', () => {
    const onClearAnswer = vi.fn();
    const html = renderToStaticMarkup(
      createElement(CorrectionHistory, {
        locale: 'en',
        questions,
        entries: [{ version: 1, answers: { consent: true } }],
        relationshipActive: false,
        onClearAnswer,
      }),
    );
    expect(html).toContain('disabled=""');
  });

  it('does not render clear-answer control on older revisions', () => {
    const onClearAnswer = vi.fn();
    const html = renderToStaticMarkup(
      createElement(CorrectionHistory, {
        locale: 'en',
        questions,
        entries: [
          { version: 1, answers: { consent: true } },
          { version: 2, answers: { consent: false } },
        ],
        onClearAnswer,
      }),
    );
    // Only one Clear answer button rendered (for version 2, the latest)
    const matches = html.match(/Clear answer/g);
    // 1 match for button text, 1 match for aria-label = 2 occurrences per button
    expect(matches?.length).toBe(2);
  });
});

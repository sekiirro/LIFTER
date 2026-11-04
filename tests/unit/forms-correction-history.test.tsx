import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CorrectionHistory } from '../../components/forms/CorrectionHistory';
import type { LabeledQuestion } from '../../components/forms/QuestionFlow';
import { getMessages } from '../../lib/i18n';

const questions: LabeledQuestion[] = [
  {
    id: 'consent',
    type: 'boolean',
    title: { en: 'Consent', ar: 'Consent' },
  },
];

describe('correction history answer labels', () => {
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
});

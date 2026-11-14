'use client';

import { useMemo } from 'react';
import { createMockFormsClientAdapter } from '../../lib/forms/mock-client-adapter';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { BrandScope } from '../ui/BrandScope';
import { QuestionFlow, type LabeledQuestion } from './QuestionFlow';

const questions = [
  {
    id: 'training-goal',
    sectionId: 'intake',
    type: 'shortText',
    required: true,
    title: {
      en: getMessages('en')['forms.demoGoal'],
      ar: getMessages('ar')['forms.demoGoal'],
    },
    description: {
      en: getMessages('en')['forms.demoGoalHint'],
      ar: getMessages('ar')['forms.demoGoalHint'],
    },
  },
  {
    id: 'injury',
    sectionId: 'intake',
    type: 'boolean',
    required: true,
    title: {
      en: getMessages('en')['forms.demoInjury'],
      ar: getMessages('ar')['forms.demoInjury'],
    },
  },
  {
    id: 'injury-detail',
    sectionId: 'intake',
    type: 'longText',
    required: true,
    title: {
      en: getMessages('en')['forms.demoInjuryDetail'],
      ar: getMessages('ar')['forms.demoInjuryDetail'],
    },
    when: {
      mode: 'all',
      conditions: [{ questionId: 'injury', operator: 'equals', value: true }],
    },
  },
] satisfies readonly LabeledQuestion[];

export function FormsDemo({
  locale,
  assignmentId = 'forms-demo',
}: {
  locale: Locale;
  assignmentId?: string;
}) {
  const messages = getMessages(locale);
  const adapter = useMemo(() => createMockFormsClientAdapter(), []);
  return (
    <BrandScope color="#7C3AED">
      <QuestionFlow
        locale={locale}
        questions={questions}
        adapter={adapter}
        assignmentId={assignmentId}
        initialState="ready"
        initialAnswers={{}}
        history={[
          {
            version: 1,
            createdAt: '2026-10-29T10:00:00Z',
            answers: {
              'training-goal': messages['forms.demoAnswer'],
              'injury-detail': messages['forms.demoHiddenAnswer'],
            },
          },
        ]}
      />
    </BrandScope>
  );
}

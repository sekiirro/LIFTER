'use client';

import { useMemo } from 'react';
import type { Locale } from '../../lib/design/preferences';
import type { ClientAssignmentResult } from '../../lib/forms/client-assignment';
import { createAuthorizedFormsClientAdapter } from '../../lib/forms/authorized-client-adapter';
import { QuestionFlow } from './QuestionFlow';

export function AuthorizedClientForm({
  assignmentId,
  locale,
  assignment,
}: {
  assignmentId: string;
  locale: Locale;
  assignment: Extract<ClientAssignmentResult, { status: 'loaded' }>;
}) {
  const adapter = useMemo(() => createAuthorizedFormsClientAdapter(), []);
  return (
    <QuestionFlow
      locale={locale}
      questions={assignment.questions}
      adapter={adapter}
      assignmentId={assignmentId}
      initialAnswers={assignment.initialAnswers}
      profileValues={assignment.profileValues}
      initialRevision={assignment.initialRevision}
      initialState={assignment.initialState}
      history={assignment.history}
      relationshipActive={assignment.relationshipActive}
    />
  );
}

'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExerciseEditor } from '../../../components/catalog/ExerciseEditor';
import type { ExerciseScope, CatalogStaffRole, ExerciseEditorDraft } from '../../../lib/catalog/exercise-editor';
import type { Locale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { saveExerciseAction } from './actions';

export function ExerciseAuthoringForm({
  locale,
  role,
  scope,
  workspaceId,
  id,
  expectedVersion,
}: {
  locale: Locale;
  role: CatalogStaffRole;
  scope: ExerciseScope;
  workspaceId: string | null;
  id?: string;
  expectedVersion?: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<'ready' | 'saving' | 'error'>('ready');
  const operationKey = useRef(globalThis.crypto.randomUUID());
  const m = getMessages(locale);
  async function submit(draft: ExerciseEditorDraft) {
    setStatus('saving');
    const result = await saveExerciseAction({
      draft,
      scope,
      workspaceId,
      operationKey: operationKey.current,
      id,
      expectedVersion,
    });
    if (result.status === 'ok') {
      router.push('/exercise-library');
      return;
    }
    setStatus('error');
  }
  return (
    <>
      <ExerciseEditor
        locale={locale}
        role={role}
        scope={scope}
        hasCoachingWork={scope === 'workspace'}
        status={status}
        onSubmit={submit}
      />
      {status === 'error' ? (
        <p role="alert">{m['catalog.editorStatusErrorDescription']}</p>
      ) : null}
    </>
  );
}

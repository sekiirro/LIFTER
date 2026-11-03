'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExerciseEditor } from '../../../components/catalog/ExerciseEditor';
import type {
  ExerciseScope,
  CatalogStaffRole,
  ExerciseEditorDraft,
} from '../../../lib/catalog/exercise-editor';
import type { Locale } from '../../../lib/design/preferences';
import type { NormalizedExercise } from '../../../lib/catalog/schemas';
import { saveExerciseAction } from './actions';

export function ExerciseAuthoringForm({
  locale,
  role,
  scope,
  workspaceId,
  id,
  expectedVersion,
  exercise,
  instructions,
}: {
  locale: Locale;
  role: CatalogStaffRole;
  scope: ExerciseScope;
  workspaceId: string | null;
  id?: string;
  expectedVersion?: number;
  exercise?: NormalizedExercise;
  instructions?: Partial<Record<'ar' | 'en', string>>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<'ready' | 'saving' | 'error'>('ready');
  const operationKey = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  async function submit(draft: ExerciseEditorDraft) {
    setStatus('saving');
    const fingerprint = JSON.stringify([
      draft,
      scope,
      workspaceId,
      id,
      expectedVersion,
    ]);
    if (operationKey.current?.fingerprint !== fingerprint) {
      operationKey.current = {
        fingerprint,
        key: globalThis.crypto.randomUUID(),
      };
    }
    try {
      const result = await saveExerciseAction({
        draft,
        scope,
        workspaceId,
        operationKey: operationKey.current.key,
        id,
        expectedVersion,
        instructions,
      });
      if (result.status === 'ok') {
        const libraryHref = workspaceId
          ? `/exercise-library?workspace=${encodeURIComponent(workspaceId)}`
          : '/exercise-library';
        router.push(id ? `/exercise-library/${id}` : libraryHref);
        return;
      }
      setStatus('error');
    } catch {
      setStatus('error');
    }
  }
  return (
    <>
      <ExerciseEditor
        locale={locale}
        role={role}
        scope={scope}
        hasCoachingWork={scope === 'workspace'}
        status={status}
        exercise={exercise}
        onSubmit={submit}
      />
    </>
  );
}

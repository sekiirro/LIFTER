'use client';

import { useRef, useState } from 'react';
import type { Locale } from '../../lib/design/preferences';
import type { VideoVariationDraft } from '../../lib/catalog/video-variation';
import {
  loadWorkspaceVideoVariationsAction,
  saveVideoVariationAction,
} from '../../app/(dashboard)/catalog-variations/actions';
import {
  VideoVariationEditor,
  type VideoVariationMapping,
} from './VideoVariationEditor';

export function VideoVariationFlow({
  locale,
  workspaces,
  exercises,
  initialWorkspaceId,
  mapping,
}: {
  locale: Locale;
  workspaces: readonly { id: string; label: string }[];
  exercises: readonly { id: string; label: string }[];
  initialWorkspaceId?: string;
  mapping?: VideoVariationMapping | null;
}) {
  const [status, setStatus] = useState<'ready' | 'saving' | 'saved' | 'error'>(
    'ready',
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    mapping?.workspaceId ?? initialWorkspaceId ?? '',
  );
  const [selectedMapping, setSelectedMapping] = useState(mapping ?? null);
  const [selectedExerciseId, setSelectedExerciseId] = useState(
    mapping?.exerciseId ?? '',
  );
  const [workspaceLoadKey, setWorkspaceLoadKey] = useState(0);
  const key = useRef<{ fingerprint: string; value: string } | null>(null);

  async function submit(
    draft: VideoVariationDraft,
    expectedVersion: number | null,
  ) {
    setStatus('saving');
    const fingerprint = JSON.stringify([draft, expectedVersion]);
    if (!key.current || key.current.fingerprint !== fingerprint)
      key.current = { fingerprint, value: crypto.randomUUID() };
    const result = await saveVideoVariationAction(
      draft,
      expectedVersion,
      key.current.value,
    );
    setStatus(result.status === 'ok' ? 'saved' : 'error');
    if (result.status === 'ok') {
      setSelectedMapping({
        ...draft,
        version: expectedVersion === null ? 1 : expectedVersion + 1,
      });
      setWorkspaceLoadKey((current) => current + 1);
      key.current = null;
    }
  }

  function selectWorkspace(workspaceId: string) {
    setSelectedWorkspaceId(workspaceId);
    setSelectedMapping(null);
    setSelectedExerciseId('');
    setWorkspaceLoadKey((current) => current + 1);
    setStatus('ready');
  }

  async function selectExercise(workspaceId: string, exerciseId: string) {
    setSelectedExerciseId(exerciseId);
    setStatus('saving');
    const result = await loadWorkspaceVideoVariationsAction(
      workspaceId,
      exerciseId,
    );
    if (result.status !== 'ok') {
      setStatus('error');
      return;
    }
    setSelectedMapping(result.data[0] ?? null);
    setWorkspaceLoadKey((current) => current + 1);
    setStatus('ready');
  }

  return (
    <>
      <VideoVariationEditor
        key={`${selectedWorkspaceId}:${workspaceLoadKey}`}
        locale={locale}
        workspaces={workspaces}
        exercises={exercises}
        initialWorkspaceId={selectedWorkspaceId}
        initialExerciseId={selectedExerciseId}
        mapping={selectedMapping}
        status={status}
        onWorkspaceChange={(workspaceId) => void selectWorkspace(workspaceId)}
        onExerciseChange={(workspaceId, exerciseId) =>
          void selectExercise(workspaceId, exerciseId)
        }
        onSubmit={(draft, version) => void submit(draft, version)}
      />
    </>
  );
}

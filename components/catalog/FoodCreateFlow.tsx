'use client';

import { useRef, useState } from 'react';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import type { FoodEditorDraft } from '../../lib/catalog/food-editor';
import { FoodEditor } from './FoodEditor';
import { DuplicateReview } from './DuplicateReview';
import {
  reviewFoodDuplicatesAction,
  saveCatalogFoodAction,
  type FoodDuplicateReviewResult,
} from '../../app/(dashboard)/catalog-foods/actions';

export function FoodCreateFlow({
  locale,
  role,
  workspaces = [],
  initialDraft,
  alternatives = [],
  onSelectExisting,
}: {
  locale: Locale;
  role: 'po' | 'workspace_owner' | 'trainer';
  workspaces?: readonly { id: string; label: string }[];
  initialDraft: FoodEditorDraft;
  alternatives?: readonly {
    id: string;
    names: Partial<Record<'ar' | 'en', string>>;
  }[];
  onSelectExisting?: (
    candidate: import('../../lib/catalog/food-editor').DuplicateCandidate,
  ) => void;
}) {
  const m = getMessages(locale);
  const [state, setState] = useState<'ready' | 'saving' | 'error' | 'success'>(
    'ready',
  );
  const [review, setReview] = useState<FoodDuplicateReviewResult | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [alternativeSaveBlocked, setAlternativeSaveBlocked] = useState(false);
  const [selectedExisting, setSelectedExisting] = useState<
    import('../../lib/catalog/food-editor').DuplicateCandidate | null
  >(null);
  const operationKey = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  function operationKeyFor(
    nextDraft: FoodEditorDraft,
    selectedWorkspaceId: string | null,
    confirmNearMatch: boolean,
  ) {
    const fingerprint = JSON.stringify([
      nextDraft,
      selectedWorkspaceId,
      confirmNearMatch,
    ]);
    if (
      !operationKey.current ||
      operationKey.current.fingerprint !== fingerprint
    ) {
      operationKey.current = { fingerprint, key: crypto.randomUUID() };
    }
    return operationKey.current.key;
  }
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  async function inspect(
    nextDraft: FoodEditorDraft,
    selectedWorkspaceId: string | null,
  ) {
    setSelectedExisting(null);
    setDraft(nextDraft);
    setWorkspaceId(selectedWorkspaceId);
    setAlternativeSaveBlocked(false);
    setState('saving');
    const result = await reviewFoodDuplicatesAction(nextDraft);
    if (result.status === 'exact' || result.status === 'near')
      setReview(result);
    else if (result.status === 'none') {
      const saved = await saveCatalogFoodAction(
        nextDraft,
        workspaceId,
        false,
        operationKeyFor(nextDraft, workspaceId, false),
      );
      setAlternativeSaveBlocked(saved.status === 'unsupported_alternatives');
      setState(saved.status === 'ok' ? 'success' : 'error');
      if (saved.status === 'ok') operationKey.current = null;
    } else setState('error');
  }
  async function confirmNear() {
    setAlternativeSaveBlocked(false);
    setState('saving');
    const result = await saveCatalogFoodAction(
      draft,
      workspaceId,
      true,
      operationKeyFor(draft, workspaceId, true),
    );
    setAlternativeSaveBlocked(result.status === 'unsupported_alternatives');
    setState(result.status === 'ok' ? 'success' : 'error');
    setReview(null);
    if (result.status === 'ok') operationKey.current = null;
  }
  if (review?.status === 'exact' || review?.status === 'near')
    return (
      <DuplicateReview
        locale={locale}
        role={role}
        state={review.status}
        candidates={review.candidates}
        onConfirm={confirmNear}
        onSelectExisting={(candidate) => {
          setSelectedExisting(candidate);
          onSelectExisting?.(candidate);
        }}
        onCancel={() => {
          setReview(null);
          setSelectedExisting(null);
          setState('ready');
        }}
      />
    );
  return (
    <>
      {selectedExisting && (
        <p role="status">
          {m['catalog.duplicateExistingSelected']}{' '}
          {selectedExisting.names[locale] ??
            selectedExisting.names.en ??
            selectedExisting.names.ar}
        </p>
      )}
      {state === 'error' && (
        <p role="alert">
          {alternativeSaveBlocked
            ? m['catalog.foodAlternativeSaveUnavailable']
            : m['catalog.foodSaveErrorDescription']}
        </p>
      )}
      <FoodEditor
        locale={locale}
        role={role}
        workspaces={workspaces}
        initialWorkspaceId={workspaceId ?? ''}
        initialDraft={draft}
        alternatives={alternatives}
        status={state}
        onSubmit={(_, nextDraft, selectedWorkspaceId) => {
          void inspect(nextDraft, selectedWorkspaceId);
        }}
      />
    </>
  );
}

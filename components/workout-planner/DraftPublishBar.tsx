'use client';

import { dirFor, type Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { Button } from '../ui/Button';
import { ErrorState } from '../ui/States';
import styles from './DraftPublishBar.module.css';

export type DraftSaveError = 'none' | 'failed' | 'conflict';

/** Last confirmed save: explicit draft, all-changes-saved idle, or none yet. */
export type DraftSavedKind = 'none' | 'draft' | 'all';

export type DraftPublishBarProps = {
  locale: Locale;
  /** An autosave or explicit save request is in flight. */
  saving: boolean;
  /** Local edits differ from the last saved draft. */
  dirty: boolean;
  lastSaved: DraftSavedKind;
  /** Parent maps the F19 `stale_version` conflict here; anything else is `failed`. */
  saveError: DraftSaveError;
  /** The single Ready & Publish request is in flight. */
  publishing: boolean;
  /** Parent-owned publish readiness (Plan Core gates). The bar never clears it. */
  canPublish: boolean;
  /** Optional explicit reassurance action; hidden when the parent omits it. */
  onSaveDraft?: () => void;
  onPublish: () => void;
  onReload: () => void;
};

/**
 * Draft/publish bar, slice 1 (FR-015; SC-006): autosave indicator, optional
 * Save as Draft, a single Ready & Publish, and conflict display. The parent
 * owns every RPC call and every readiness decision; a no-op autosave
 * (same version coming back) changes nothing here except the indicator.
 */
export function DraftPublishBar({
  locale,
  saving,
  dirty,
  lastSaved,
  saveError,
  publishing,
  canPublish,
  onSaveDraft,
  onPublish,
  onReload,
}: DraftPublishBarProps) {
  const m = getMessages(locale);
  const dir = dirFor(locale);
  const conflicted = saveError === 'conflict';
  const publishDisabled = !canPublish || saving || publishing || conflicted;

  let status: string | null = null;
  if (saveError === 'failed') status = m['forms.saveFailed'];
  else if (saving) status = m['forms.saving'];
  else if (dirty) status = m['forms.unsaved'];
  else if (lastSaved === 'draft') status = m['forms.draftSaved'];
  else if (lastSaved === 'all') status = m['planner.allSaved'];

  return (
    <div
      dir={dir}
      lang={locale}
      data-testid="draft-publish-bar"
      className={styles.bar}
    >
      {conflicted ? (
        <ErrorState
          title={m['forms.conflictTitle']}
          description={m['forms.conflictBody']}
          onRetry={onReload}
          retryLabel={m['forms.reloadDraft']}
        />
      ) : (
        <p
          data-testid="draft-save-status"
          role="status"
          aria-live="polite"
          className={styles.status}
        >
          {status ?? ''}
        </p>
      )}
      <div className={styles.actions}>
        {onSaveDraft !== undefined && (
          <Button
            variant="secondary"
            onClick={onSaveDraft}
            disabled={saving || publishing}
          >
            {m['planner.saveAsDraft']}
          </Button>
        )}
        <Button
          variant="primary"
          onClick={onPublish}
          disabled={publishDisabled}
          loading={publishing}
          loadingLabel={m['planner.publishing']}
        >
          {publishing ? m['planner.publishing'] : m['planner.readyPublish']}
        </Button>
      </div>
    </div>
  );
}

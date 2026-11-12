'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import { Alert } from '../ui/Alert';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { getMessages } from '../../lib/i18n';
import type { Locale } from '../../lib/design/preferences';
import { dirFor } from '../../lib/design/preferences';
import { normalizeClientNoteBody } from '../../lib/client-notes/validation';
import styles from './ClientNotes.module.css';

export type ClientNote = {
  id: string;
  workspace_id: string;
  client_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
};

export type ClientNotesStatus = 'idle' | 'loading' | 'error' | 'ready';
export type ClientNoteCursor = Pick<ClientNote, 'created_at' | 'id'>;

export type ClientNotesProps = {
  clientId?: string;
  workspaceId?: string;
  locale?: Locale;
  messages?: ReturnType<typeof getMessages>;
  notes?: readonly ClientNote[];
  hasMore?: boolean;
  status?: ClientNotesStatus;
  error?: string | null;
  actorId?: string | null;
  role?: string | null;
  canCreate?: boolean;
  onSuccess?: (action: 'created' | 'edited' | 'deleted') => void;
  onRetryLoad?: () => void;
  onLoadMore?: (cursor: ClientNoteCursor) => Promise<{
    status: string;
    notes?: ClientNote[];
    hasMore?: boolean;
  }>;
  onCreate?: (
    body: string,
    idempotencyKey: string,
  ) => Promise<{ status: string; note?: ClientNote; error?: string }>;
  onUpdate?: (
    noteId: string,
    body: string,
  ) => Promise<{ status: string; note?: ClientNote; error?: string }>;
  onDelete?: (noteId: string) => Promise<{ status: string; error?: string }>;
};

const EMPTY_NOTES: readonly ClientNote[] = [];

const PLATFORM_OWNER = 'platform_owner';
const PENDING_CREATE_PREFIX = 'lifter-client-notes-pending-create:v1:';
const TAB_NAME_PREFIX = 'lifter-client-notes-tab:v1:';

type PendingCreate = {
  tabId: string;
  actorId: string;
  clientId: string;
  workspaceId: string;
  text: string;
  body: string;
  idempotencyKey: string;
  retrySent: boolean;
};

function pendingStorageKey(workspaceId: string, clientId: string) {
  return `${PENDING_CREATE_PREFIX}${workspaceId}:${clientId}`;
}

function currentTabId() {
  if (window.name.startsWith(TAB_NAME_PREFIX))
    return window.name.slice(TAB_NAME_PREFIX.length);
  const id = newIdempotencyKey();
  window.name = `${TAB_NAME_PREFIX}${id}`;
  return id;
}

function canEditNote(
  note: ClientNote,
  actorId: string | null,
  role: string | null,
) {
  if (role === PLATFORM_OWNER) return true;
  return !!actorId && note.author_user_id === actorId;
}

function canDeleteNote(_note: ClientNote, role: string | null) {
  return role === PLATFORM_OWNER;
}

function newIdempotencyKey() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `cn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ClientNotes(props: ClientNotesProps) {
  const locale = props.locale ?? 'ar';
  const m = props.messages ?? getMessages(locale);
  const dir = dirFor(locale);
  const sourceNotes = props.notes ?? EMPTY_NOTES;
  const [pageState, setPageState] = useState({
    source: sourceNotes,
    extra: [] as readonly ClientNote[],
    hasMore: props.hasMore ?? false,
    failed: false,
  });
  const pageStateIsCurrent = pageState.source === sourceNotes;
  const notes = pageStateIsCurrent
    ? pageState.extra.length > 0
      ? [...sourceNotes, ...pageState.extra]
      : sourceNotes
    : sourceNotes;
  const hasMore = pageStateIsCurrent
    ? pageState.hasMore
    : (props.hasMore ?? false);
  const [loadingMore, setLoadingMore] = useState(false);
  const status = props.status ?? 'ready';
  const actorId = props.actorId ?? null;
  const role = props.role ?? null;
  const canCreate = props.canCreate ?? true;

  const [draft, setDraft] = useState('');
  const [createEditorClosed, setCreateEditorClosed] = useState(false);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [unknownCreate, setUnknownCreate] = useState(false);
  const [unknownEdit, setUnknownEdit] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<{
    noteId: string;
    body: string;
  } | null>(null);
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(
    null,
  );
  const storageAvailable = useRef(true);
  const tabId = useRef<string | null>(null);
  const recoveryIdentity =
    props.actorId && props.clientId && props.workspaceId
      ? `${props.actorId}:${props.workspaceId}:${props.clientId}`
      : null;
  const [recoveryReadyFor, setRecoveryReadyFor] = useState<string | null>(null);
  const recoveryReady =
    recoveryIdentity === null || recoveryReadyFor === recoveryIdentity;
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitMode, setExitMode] = useState<'unsaved' | 'inflight' | 'unknown'>(
    'unsaved',
  );

  const loadMore = async () => {
    const last = notes.at(-1);
    if (!last || !hasMore || loadingMore || !props.onLoadMore) return;
    setLoadingMore(true);
    setPageState((current) => ({
      source: sourceNotes,
      extra: current.source === sourceNotes ? current.extra : [],
      hasMore: current.source === sourceNotes ? current.hasMore : hasMore,
      failed: false,
    }));
    try {
      const result = await props.onLoadMore({
        created_at: last.created_at,
        id: last.id,
      });
      if (result.status !== 'ok' || !result.notes) {
        setPageState((current) => ({ ...current, failed: true }));
        return;
      }
      setPageState((current) => {
        const extra = current.source === sourceNotes ? current.extra : [];
        const seen = new Set([...sourceNotes, ...extra].map((note) => note.id));
        return {
          source: sourceNotes,
          extra: [
            ...extra,
            ...result.notes!.filter((note) => !seen.has(note.id)),
          ],
          hasMore: result.hasMore === true,
          failed: false,
        };
      });
    } catch {
      setPageState((current) => ({ ...current, failed: true }));
    } finally {
      setLoadingMore(false);
    }
  };

  const moreLoadFailed = pageStateIsCurrent && pageState.failed;

  const storageKey =
    props.clientId && props.workspaceId
      ? pendingStorageKey(props.workspaceId, props.clientId)
      : null;

  const removePendingCreate = useCallback(
    (expectedKey: string) => {
      if (!storageKey || !storageAvailable.current) return;
      try {
        const raw = window.sessionStorage.getItem(storageKey);
        if (
          raw &&
          (JSON.parse(raw) as Partial<PendingCreate>).idempotencyKey !==
            expectedKey
        )
          return;
        window.sessionStorage.removeItem(storageKey);
      } catch {
        storageAvailable.current = false;
      }
    },
    [storageKey],
  );

  const writePendingCreate = useCallback(
    (record: PendingCreate) => {
      setPendingCreate(record);
      if (!storageKey || !storageAvailable.current) return;
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(record));
      } catch {
        // Storage is optional; the create must still be sent and tracked in memory.
        storageAvailable.current = false;
      }
    },
    [storageKey],
  );

  useEffect(() => {
    if (
      !storageKey ||
      !props.actorId ||
      !props.clientId ||
      !props.workspaceId ||
      !recoveryIdentity
    )
      return;
    let active = true;
    let recordToRestore: PendingCreate | null = null;
    try {
      const currentId = currentTabId();
      tabId.current = currentId;
      const sessionKeys = Array.from(
        { length: window.sessionStorage.length },
        (_, index) => window.sessionStorage.key(index),
      );
      for (const key of sessionKeys) {
        if (!key?.startsWith(PENDING_CREATE_PREFIX)) continue;
        const stored = window.sessionStorage.getItem(key);
        if (!stored) continue;
        try {
          const record = JSON.parse(stored) as Partial<PendingCreate>;
          if (record.actorId !== props.actorId)
            window.sessionStorage.removeItem(key);
        } catch {
          window.sessionStorage.removeItem(key);
        }
      }
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const stored = JSON.parse(raw) as Partial<PendingCreate>;
        if (
          stored.tabId !== currentId ||
          stored.actorId !== props.actorId ||
          stored.clientId !== props.clientId ||
          stored.workspaceId !== props.workspaceId ||
          typeof stored.text !== 'string' ||
          typeof stored.body !== 'string' ||
          typeof stored.idempotencyKey !== 'string' ||
          typeof stored.retrySent !== 'boolean'
        ) {
          window.sessionStorage.removeItem(storageKey);
        } else {
          recordToRestore = stored as PendingCreate;
        }
      }
    } catch {
      // Treat unavailable or malformed session storage as page-memory only.
      storageAvailable.current = false;
    }
    queueMicrotask(() => {
      if (!active) return;
      if (recordToRestore) {
        const record = recordToRestore;
        setPendingCreate(record);
        setDraft(record.text);
        setIdempotencyKey(record.idempotencyKey);
        setUnknownCreate(true);
        setSaveError(m['clientNotes.saveError']);
      }
      setRecoveryReadyFor(recoveryIdentity);
    });
    return () => {
      active = false;
    };
  }, [
    m,
    props.actorId,
    props.clientId,
    props.workspaceId,
    recoveryIdentity,
    storageKey,
  ]);

  const editedNote = editingId
    ? notes.find((note) => note.id === editingId)
    : undefined;
  const hasUnsavedChanges =
    draft.length > 0 ||
    (!!editedNote && editDraft !== editedNote.body) ||
    unknownCreate ||
    unknownEdit;

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const formatTimestamp = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const parts = new Intl.DateTimeFormat(
      locale === 'ar' ? 'ar-u-nu-latn' : 'en-u-nu-latn',
      {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        ...(hydrated ? {} : { timeZone: 'UTC' }),
      },
    ).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value ?? '';
    const dateText = `${part('day')} ${part('month')} ${part('year')}`;
    const timeText = `${part('hour')}:${part('minute')} ${part('dayPeriod')}`;
    return locale === 'ar'
      ? `${dateText}، ${timeText}`
      : `${dateText}, ${timeText}`;
  };

  const handleCreate = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const retryingUnknown = unknownCreate && pendingCreate !== null;
      const body = retryingUnknown
        ? pendingCreate.body
        : normalizeClientNoteBody(draft);
      if (body === null) {
        if (draft.trim().length === 0)
          setSaveError(m['clientNotes.blankError']);
        else setSaveError(m['clientNotes.tooLongError']);
        return;
      }
      const key = retryingUnknown
        ? pendingCreate.idempotencyKey
        : (idempotencyKey ?? newIdempotencyKey());
      if (!idempotencyKey) setIdempotencyKey(key);
      const record: PendingCreate = {
        tabId: tabId.current ?? currentTabId(),
        actorId: props.actorId ?? '',
        clientId: props.clientId ?? '',
        workspaceId: props.workspaceId ?? '',
        text: retryingUnknown ? pendingCreate.text : draft,
        body,
        idempotencyKey: key,
        retrySent: retryingUnknown ? true : (pendingCreate?.retrySent ?? false),
      };
      // Persist before dispatch so a same-tab reload can reconcile an unknown result.
      writePendingCreate(record);
      setSaving(true);
      setSaveError(null);
      try {
        const res = await props.onCreate?.(body, key);
        if (res?.status === 'ok') {
          props.onSuccess?.('created');
          setCreateEditorClosed(false);
          removePendingCreate(key);
          setDraft('');
          setIdempotencyKey(null);
          setPendingCreate(null);
          setUnknownCreate(false);
        } else {
          setSaveError(m['clientNotes.saveError']);
          const definiteRefusal =
            res?.status === 'denied' ||
            res?.status === 'invalid_input' ||
            res?.status === 'not_found';
          if (!definiteRefusal || retryingUnknown) {
            setUnknownCreate(true);
            setPendingCreate(record);
            if (!retryingUnknown) writePendingCreate(record);
          } else {
            // A definite refusal before any retry resolves this create attempt.
            removePendingCreate(key);
            setIdempotencyKey(null);
            setPendingCreate(null);
            setUnknownCreate(false);
          }
        }
      } catch {
        setSaveError(m['clientNotes.saveError']);
        setUnknownCreate(true);
        setPendingCreate(record);
      } finally {
        setSaving(false);
      }
    },
    [
      draft,
      idempotencyKey,
      m,
      pendingCreate,
      props,
      removePendingCreate,
      unknownCreate,
      writePendingCreate,
    ],
  );

  const handleUpdate = useCallback(
    async (noteId: string, retryBody?: string) => {
      const body = normalizeClientNoteBody(retryBody ?? editDraft);
      if (body === null) {
        if (editDraft.trim().length === 0)
          setSaveError(m['clientNotes.blankError']);
        else setSaveError(m['clientNotes.tooLongError']);
        return;
      }
      setSaving(true);
      setSaveError(null);
      try {
        const res = await props.onUpdate?.(noteId, body);
        if (res?.status === 'ok') {
          props.onSuccess?.('edited');
          setEditingId(null);
          setEditDraft('');
          setUnknownEdit(false);
          setPendingEdit(null);
        } else {
          setSaveError(m['clientNotes.saveError']);
          const unknown =
            res?.status !== 'denied' &&
            res?.status !== 'invalid_input' &&
            res?.status !== 'not_found';
          setUnknownEdit(unknown);
          if (unknown) setPendingEdit({ noteId, body });
          else if (pendingEdit?.noteId === noteId) {
            setPendingEdit(null);
            setEditingId(noteId);
            setEditDraft(body);
          }
        }
      } catch {
        setSaveError(m['clientNotes.saveError']);
        setUnknownEdit(true);
        setPendingEdit({ noteId, body });
      } finally {
        setSaving(false);
      }
    },
    [editDraft, pendingEdit, props, m],
  );

  const handleDelete = useCallback(
    async (noteId: string) => {
      setDeleteTargetId(null);
      try {
        const res = await props.onDelete?.(noteId);
        if (res?.status === 'ok') {
          props.onSuccess?.('deleted');
        } else {
          setSaveError(m['clientNotes.deleteError']);
        }
      } catch {
        setSaveError(m['clientNotes.deleteError']);
      }
    },
    [props, m],
  );

  const startEdit = (note: ClientNote) => {
    setEditingId(note.id);
    setEditDraft(note.body);
    setSaveError(null);
    setUnknownEdit(false);
  };

  const cancelEdit = () => {
    if (saving || unknownEdit) {
      setExitMode(saving ? 'inflight' : 'unknown');
      setExitOpen(true);
      return;
    }
    if (editedNote && editDraft !== editedNote.body) {
      setExitMode('unsaved');
      setExitOpen(true);
      return;
    }
    setEditingId(null);
    setEditDraft('');
    setUnknownEdit(false);
  };

  const confirmDiscard = () => {
    setExitOpen(false);
    if (exitMode === 'unknown' && pendingCreate) {
      setCreateEditorClosed(true);
      return;
    }
    if (exitMode === 'unknown' && unknownEdit && editingId) {
      setPendingEdit({ noteId: editingId, body: editDraft });
      setEditingId(null);
      setEditDraft('');
      setUnknownEdit(false);
      return;
    }
    if (editingId) {
      setEditingId(null);
      setEditDraft('');
      setUnknownEdit(false);
    } else {
      setDraft('');
      setIdempotencyKey(null);
    }
  };

  const stay = () => setExitOpen(false);

  const cancelCreate = () => {
    if (saving) {
      setExitMode('inflight');
      setExitOpen(true);
      return;
    }
    if (unknownCreate) {
      setExitMode('unknown');
      setExitOpen(true);
      return;
    }
    if (draft.trim().length > 0) {
      setExitMode('unsaved');
      setExitOpen(true);
      return;
    }
    setDraft('');
    setIdempotencyKey(null);
  };

  const counterText = (value: string) =>
    m['clientNotes.charCounter'].replace(
      '{count}',
      String(Array.from(value).length),
    );

  return (
    <section
      className={styles.root}
      dir={dir}
      lang={locale === 'ar' ? 'ar' : 'en'}
      data-testid="client-notes"
    >
      <h2 className={styles.title}>{m['clientNotes.tab']}</h2>

      {status === 'loading' && (
        <p role="status" aria-live="polite">
          {m['clientNotes.loading']}
        </p>
      )}

      {status === 'error' && (
        <Alert tone="error" title={m['clientNotes.loadError']}>
          <Button type="button" onClick={props.onRetryLoad}>
            {m['clientNotes.retry']}
          </Button>
        </Alert>
      )}

      {status === 'ready' && (
        <>
          {notes.length === 0 && (
            <p className={styles.empty}>{m['clientNotes.empty']}</p>
          )}

          {notes.length > 0 && (
            <ul className={styles.list}>
              {notes.map((note) => {
                const editing = editingId === note.id;
                const authorLabel = m['clientNotes.unavailableAuthor'];
                return (
                  <li key={note.id} className={styles.note}>
                    <div className={styles.metadata}>
                      <Bidi>
                        {m['clientNotes.byline']
                          .replace('{author}', authorLabel)
                          .replace('{time}', formatTimestamp(note.created_at))}
                      </Bidi>
                    </div>
                    {note.edited_at && (
                      <div className={styles.metadata}>
                        {m['clientNotes.editedMarker'].replace(
                          '{time}',
                          formatTimestamp(note.edited_at as string),
                        )}
                      </div>
                    )}
                    {editing ? (
                      <div className={styles.editor}>
                        <label className={styles.field}>
                          {m['clientNotes.noteLabel']}
                          <textarea
                            className={styles.textarea}
                            rows={5}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            aria-label={m['clientNotes.noteLabel']}
                            readOnly={saving || unknownEdit}
                          />
                        </label>
                        <span className={styles.counter}>
                          {counterText(editDraft)}
                        </span>
                        {saveError && <Alert tone="error" title={saveError} />}
                        <div className={styles.actions}>
                          <Button
                            type="button"
                            onClick={() => handleUpdate(note.id)}
                            disabled={saving}
                          >
                            {saving
                              ? m['clientNotes.saving']
                              : unknownEdit
                                ? m['clientNotes.retry']
                                : m['clientNotes.saveChanges']}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={cancelEdit}
                          >
                            {m['clientNotes.cancel']}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={styles.body}>
                          <Bidi>{note.body}</Bidi>
                        </div>
                        <div className={styles.actions}>
                          {canEditNote(note, actorId, role) && !pendingEdit && (
                            <Button
                              type="button"
                              onClick={() => startEdit(note)}
                            >
                              {m['clientNotes.edit']}
                            </Button>
                          )}
                          {canDeleteNote(note, role) && (
                            <Button
                              type="button"
                              variant="destructive"
                              onClick={() => setDeleteTargetId(note.id)}
                            >
                              {m['clientNotes.delete']}
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {canCreate && !editingId && !createEditorClosed && (
            <form className={styles.form} onSubmit={handleCreate}>
              <h3 className={styles.createTitle}>{m['clientNotes.create']}</h3>
              <label className={styles.field}>
                {m['clientNotes.noteLabel']}
                <textarea
                  className={styles.textarea}
                  rows={5}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setIdempotencyKey(null);
                  }}
                  aria-label={m['clientNotes.noteLabel']}
                  readOnly={saving || unknownCreate || !recoveryReady}
                />
              </label>
              <span className={styles.counter}>{counterText(draft)}</span>
              {saveError && <Alert tone="error" title={saveError} />}
              <div className={styles.actions}>
                <Button type="submit" disabled={saving || !recoveryReady}>
                  {saving
                    ? m['clientNotes.saving']
                    : unknownCreate
                      ? m['clientNotes.retry']
                      : m['clientNotes.saveNote']}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={cancelCreate}
                >
                  {m['clientNotes.cancel']}
                </Button>
              </div>
            </form>
          )}

          {canCreate && !editingId && createEditorClosed && unknownCreate && (
            <Alert tone="error" title={m['clientNotes.saveError']}>
              <Button type="button" onClick={() => void handleCreate()}>
                {m['clientNotes.retry']}
              </Button>
            </Alert>
          )}

          {pendingEdit && !editingId && (
            <Alert tone="error" title={m['clientNotes.saveError']}>
              <Button
                type="button"
                disabled={saving}
                onClick={() =>
                  void handleUpdate(pendingEdit.noteId, pendingEdit.body)
                }
              >
                {m['clientNotes.retry']}
              </Button>
            </Alert>
          )}

          {moreLoadFailed && (
            <Alert tone="error" title={m['clientNotes.loadError']}>
              <Button type="button" onClick={() => void loadMore()}>
                {m['clientNotes.retry']}
              </Button>
            </Alert>
          )}

          {hasMore && (
            <Button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore
                ? m['clientNotes.loading']
                : m['clientNotes.loadMore']}
            </Button>
          )}

          {exitOpen && (
            <ConfirmDialog
              open
              title={m['clientNotes.exitWarning.title']}
              description={
                exitMode === 'inflight'
                  ? m['clientNotes.exitWarning.bodyInFlight']
                  : exitMode === 'unknown'
                    ? m['clientNotes.saveError']
                    : m['clientNotes.exitWarning.body']
              }
              confirmLabel={m['clientNotes.exitWarning.discard']}
              cancelLabel={m['clientNotes.exitWarning.stay']}
              onConfirm={confirmDiscard}
              onCancel={stay}
            />
          )}
          {deleteTargetId !== null && (
            <ConfirmDialog
              open
              title={m['clientNotes.deleteDialogTitle']}
              description={m['clientNotes.deleteDialogBody']}
              confirmLabel={m['clientNotes.deleteDialogConfirm']}
              cancelLabel={m['clientNotes.cancel']}
              tone="destructive"
              onConfirm={() => void handleDelete(deleteTargetId)}
              onCancel={() => setDeleteTargetId(null)}
            />
          )}
        </>
      )}
    </section>
  );
}

export default ClientNotes;

// Aliases for common naming
export { ClientNotes as ClientNotesTab };
export { ClientNotes as ClientNotesPanel };

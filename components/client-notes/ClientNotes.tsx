'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
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
import {
  clearClientNotesRequestSequences,
  clientNotesHasUnsavedWork,
  clientNotesReducer,
  createClientNotesState,
  createRequestSequences,
  nextClientNotesRequestSequence,
  transitionClientNotesState,
  type ClientNote as ClientNoteState,
  type PendingCreate,
  type PendingEdit,
} from '../../lib/client-notes/state';
import styles from './ClientNotes.module.css';

export type ClientNote = ClientNoteState;

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

function mergePageNotes(
  firstPage: readonly ClientNote[],
  loadedPages: readonly ClientNote[],
): ClientNote[] {
  const seen = new Set(firstPage.map((note) => note.id));
  return [
    ...firstPage,
    ...loadedPages.filter((note) => {
      if (seen.has(note.id)) return false;
      seen.add(note.id);
      return true;
    }),
  ].sort((left, right) => {
    const createdAtOrder =
      Date.parse(right.created_at) - Date.parse(left.created_at);
    if (Number.isFinite(createdAtOrder) && createdAtOrder !== 0)
      return createdAtOrder;
    return (
      right.created_at.localeCompare(left.created_at) ||
      right.id.localeCompare(left.id)
    );
  });
}

const PLATFORM_OWNER = 'platform_owner';
const PENDING_CREATE_PREFIX = 'lifter-client-notes-pending-create:v1:';
const TAB_NAME_PREFIX = 'lifter-client-notes-tab:v1:';

function pendingCreateIdentity(record: PendingCreate) {
  return `${record.tabId}:${record.actorId}:${record.workspaceId}:${record.clientId}`;
}

function samePendingCreate(left: PendingCreate, right: PendingCreate) {
  return (
    left.tabId === right.tabId &&
    left.actorId === right.actorId &&
    left.clientId === right.clientId &&
    left.workspaceId === right.workspaceId &&
    left.text === right.text &&
    left.body === right.body &&
    left.idempotencyKey === right.idempotencyKey &&
    left.retrySent === right.retrySent
  );
}

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
  const [recoveryState, dispatchRecovery] = useReducer(
    clientNotesReducer,
    props.actorId ?? null,
    createClientNotesState,
  );
  const sessionGeneration = useRef(0);
  const mounted = useRef(true);
  const priorActorId = useRef(props.actorId ?? null);
  const isCurrentSession = useCallback(
    (generation: number) =>
      mounted.current && sessionGeneration.current === generation,
    [],
  );
  const pageScope = JSON.stringify([
    props.workspaceId ?? null,
    props.clientId ?? null,
    props.actorId ?? null,
    props.role ?? null,
  ]);
  const [pageState, setPageState] = useState({
    scope: pageScope,
    source: sourceNotes,
    extra: [] as readonly ClientNote[],
    deletedIds: [] as readonly string[],
    cursor: sourceNotes.at(-1) ?? null,
    hasMore: props.hasMore ?? false,
    failed: false,
  });
  const pageStateIsForScope = pageState.scope === pageScope;
  const pageStateIsCurrent =
    pageStateIsForScope && pageState.source === sourceNotes;
  const pageNotes = pageStateIsCurrent
    ? mergePageNotes(sourceNotes, pageState.extra)
    : sourceNotes;
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreInFlight = useRef(false);
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
  const [editingNoteSnapshot, setEditingNoteSnapshot] =
    useState<ClientNote | null>(null);
  const editedSnapshots =
    recoveryState.editedSnapshotScope === pageScope
      ? recoveryState.editedSnapshots.filter(
          (note) =>
            props.hasMore !== false ||
            sourceNotes.some((n) => n.id === note.id),
        )
      : [];
  const editorGeneration = useRef(0);
  const activeEditorId = useRef<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const saveInFlightNoteIdRef = useRef<string | null>(null);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingNoteIds, setDeletingNoteIds] = useState<string[]>([]);
  const deletingNoteIdsRef = useRef(new Set<string>());
  const createRequestSequence = useRef(0);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [unknownCreate, setUnknownCreate] = useState(false);
  const [unknownEdit, setUnknownEdit] = useState(false);
  const pendingEdits = recoveryState.pendingEdits;
  const pendingCreate = recoveryState.pendingCreate;
  const setPendingCreate = useCallback(
    (record: PendingCreate | null) =>
      dispatchRecovery(
        record
          ? { type: 'pending-create-set', record }
          : { type: 'pending-create-cleared' },
      ),
    [],
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
  const exitTarget = recoveryState.exitTarget;

  const notesWithEditedSnapshots = mergePageNotes(pageNotes, editedSnapshots);
  const notes =
    editingId &&
    editingNoteSnapshot &&
    editingNoteSnapshot.id === editingId &&
    !notesWithEditedSnapshots.some((note) => note.id === editingId)
      ? [...notesWithEditedSnapshots, editingNoteSnapshot]
      : notesWithEditedSnapshots;
  const hasMore = pageStateIsCurrent
    ? pageState.hasMore
    : (props.hasMore ?? false);
  const pendingNavigation = useRef<HTMLAnchorElement | null>(null);
  const allowNavigationClick = useRef(false);

  const openExitWarning = useCallback(
    (
      mode: 'unsaved' | 'inflight' | 'unknown',
      switchTo: string | null = null,
      navigation = false,
    ) => {
      const noteId = activeEditorId.current;
      dispatchRecovery({
        type: 'exit-target-set',
        target: noteId
          ? {
              kind: 'edit',
              noteId,
              generation: editorGeneration.current,
              body: editDraft,
              switchTo,
              navigation,
            }
          : draft.length > 0 || pendingCreate !== null
            ? { kind: 'create', body: draft, navigation }
            : pendingEdits.length > 0
              ? {
                  kind: 'pending',
                  noteIds: pendingEdits.map((pending) => pending.noteId),
                  navigation,
                }
              : { kind: 'create', body: draft, navigation },
      });
      setExitMode(mode);
      setExitOpen(true);
    },
    [draft, editDraft, pendingCreate, pendingEdits],
  );

  const setActiveEditor = (noteId: string | null) => {
    editorGeneration.current += 1;
    activeEditorId.current = noteId;
    setEditingId(noteId);
  };

  const setPendingEdit = (pending: PendingEdit) => {
    dispatchRecovery({ type: 'pending-edit-set', pending });
  };

  const clearPendingEdit = (noteId: string) => {
    dispatchRecovery({ type: 'pending-edit-cleared', noteId });
  };

  useLayoutEffect(() => {
    mounted.current = true;
    sessionGeneration.current += 1;
    dispatchRecovery({
      type: 'session-mounted',
      actorId: priorActorId.current,
    });
    return () => {
      mounted.current = false;
      sessionGeneration.current += 1;
      const transition = transitionClientNotesState(
        createClientNotesState(priorActorId.current),
        { type: 'session-unmounted' },
      );
      for (const effect of transition.effects) {
        if (effect.type === 'clear-request-sequences')
          clearClientNotesRequestSequences();
      }
    };
  }, []);

  useLayoutEffect(() => {
    const actorId = props.actorId ?? null;
    if (priorActorId.current === actorId) return;
    const previousActorId = priorActorId.current;
    const actorStorageKey =
      props.clientId && props.workspaceId
        ? pendingStorageKey(props.workspaceId, props.clientId)
        : null;
    priorActorId.current = actorId;
    sessionGeneration.current += 1;
    const transition = {
      type: 'session-changed',
      actorId,
    } as const;
    const result = transitionClientNotesState(
      createClientNotesState(previousActorId),
      transition,
    );
    dispatchRecovery(transition);
    for (const effect of result.effects) {
      if (effect.type === 'clear-request-sequences')
        clearClientNotesRequestSequences();
      if (effect.type === 'clear-recovery-storage' && actorStorageKey) {
        try {
          window.sessionStorage.removeItem(actorStorageKey);
        } catch {
          storageAvailable.current = false;
        }
      }
    }
    setDraft('');
    setIdempotencyKey(null);
    setUnknownCreate(false);
    setUnknownEdit(false);
    setActiveEditor(null);
    setEditingNoteSnapshot(null);
    setEditDraft('');
    saveInFlight.current = false;
    saveInFlightNoteIdRef.current = null;
    setSaving(false);
    setSavingNoteId(null);
    loadMoreInFlight.current = false;
    setLoadingMore(false);
    deletingNoteIdsRef.current.clear();
    setDeletingNoteIds([]);
    setExitOpen(false);
    pendingNavigation.current = null;
  }, [props.actorId, props.clientId, props.workspaceId]);

  useEffect(() => {
    dispatchRecovery({
      type: 'first-page-refreshed',
      scope: pageScope,
      notes: sourceNotes,
      complete: props.hasMore !== true,
    });
  }, [pageScope, props.hasMore, sourceNotes]);

  const loadMore = async () => {
    const last = pageStateIsCurrent ? pageState.cursor : sourceNotes.at(-1);
    if (
      !last ||
      !hasMore ||
      loadingMore ||
      loadMoreInFlight.current ||
      !props.onLoadMore
    )
      return;
    loadMoreInFlight.current = true;
    const requestGeneration = sessionGeneration.current;
    setLoadingMore(true);
    setPageState((current) => ({
      scope: pageScope,
      source: sourceNotes,
      extra:
        current.scope === pageScope && current.source === sourceNotes
          ? current.extra
          : [],
      deletedIds:
        current.scope === pageScope && current.source === sourceNotes
          ? current.deletedIds
          : [],
      cursor: last,
      hasMore,
      failed: false,
    }));
    try {
      const result = await props.onLoadMore({
        created_at: last.created_at,
        id: last.id,
      });
      if (!isCurrentSession(requestGeneration)) return;
      if (result.status !== 'ok' || !result.notes) {
        setPageState((current) => ({ ...current, failed: true }));
        return;
      }
      setPageState((current) => {
        const samePage =
          current.scope === pageScope && current.source === sourceNotes;
        const extra = samePage ? current.extra : [];
        const deletedIds = samePage ? current.deletedIds : [];
        const seen = new Set([
          ...sourceNotes.map((note) => note.id),
          ...extra.map((note) => note.id),
          ...deletedIds,
        ]);
        return {
          scope: pageScope,
          source: sourceNotes,
          deletedIds,
          extra: [
            ...extra,
            ...result.notes!.filter((note) => !seen.has(note.id)),
          ],
          cursor: result.notes!.at(-1) ?? last,
          hasMore: result.hasMore === true,
          failed: false,
        };
      });
    } catch {
      if (isCurrentSession(requestGeneration))
        setPageState((current) => ({ ...current, failed: true }));
    } finally {
      if (isCurrentSession(requestGeneration)) {
        loadMoreInFlight.current = false;
        setLoadingMore(false);
      }
    }
  };

  const moreLoadFailed = pageStateIsCurrent && pageState.failed;

  const storageKey =
    props.clientId && props.workspaceId
      ? pendingStorageKey(props.workspaceId, props.clientId)
      : null;

  const removePendingCreate = useCallback(
    (expected: PendingCreate) => {
      if (!storageKey || !storageAvailable.current) return;
      try {
        const raw = window.sessionStorage.getItem(storageKey);
        if (!raw) return;
        const current = JSON.parse(raw) as PendingCreate;
        if (!samePendingCreate(current, expected)) return;
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
    [setPendingCreate, storageKey],
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
    setPendingCreate,
    storageKey,
  ]);

  const editedNote = editingId
    ? notes.find((note) => note.id === editingId)
    : undefined;
  const hasUnsavedChanges = clientNotesHasUnsavedWork({
    createDraft: draft,
    activeEdit: editedNote
      ? { original: editedNote.body, body: editDraft }
      : null,
    pendingCreateBody: pendingCreate?.body ?? (unknownCreate ? draft : null),
    pendingEdits,
    inFlight: saving || deletingNoteIds.length > 0 ? [true] : [],
  });

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const warnBeforeNavigation = (event: MouseEvent) => {
      if (allowNavigationClick.current) {
        allowNavigationClick.current = false;
        return;
      }
      if (exitOpen) {
        event.preventDefault();
        return;
      }
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target = event.target as {
        closest?: (selector: string) => HTMLAnchorElement | null;
      } | null;
      const link = target?.closest?.('a[href]');
      if (
        !link ||
        link.hasAttribute('download') ||
        (link.target && link.target !== '_self')
      )
        return;
      const destination = new URL(link.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        (destination.pathname === window.location.pathname &&
          destination.search === window.location.search)
      )
        return;
      event.preventDefault();
      pendingNavigation.current = link;
      openExitWarning(
        saving
          ? 'inflight'
          : unknownCreate || unknownEdit || pendingEdits.length > 0
            ? 'unknown'
            : 'unsaved',
        null,
        true,
      );
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    document.addEventListener('click', warnBeforeNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      document.removeEventListener('click', warnBeforeNavigation, true);
    };
  }, [
    exitOpen,
    hasUnsavedChanges,
    draft,
    editDraft,
    openExitWarning,
    pendingEdits.length,
    saving,
    unknownCreate,
    unknownEdit,
  ]);

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
      if (saveInFlight.current) return;
      saveInFlightNoteIdRef.current = null;
      setSavingNoteId(null);
      const retryingUnknown = unknownCreate && pendingCreate !== null;
      const rawBody = retryingUnknown ? pendingCreate.body : draft;
      const body = normalizeClientNoteBody(rawBody);
      if (body === null) {
        if (rawBody.includes('\u0000'))
          setSaveError(m['clientNotes.saveError']);
        else if (rawBody.trim().length === 0)
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
      const requestIdentity = pendingCreateIdentity(record);
      const requestSequence = nextClientNotesRequestSequence();
      createRequestSequences.set(requestIdentity, requestSequence);
      const localSequence = ++createRequestSequence.current;
      const requestGeneration = sessionGeneration.current;
      saveInFlight.current = true;
      // Persist before dispatch so a same-tab reload can reconcile an unknown result.
      writePendingCreate(record);
      setSaving(true);
      setSaveError(null);
      try {
        const res = await props.onCreate?.(body, key);
        if (!isCurrentSession(requestGeneration)) return;
        if (createRequestSequences.get(requestIdentity) !== requestSequence)
          return;
        if (res?.status === 'ok') {
          props.onSuccess?.('created');
          removePendingCreate(record);
          setDraft('');
          setIdempotencyKey(null);
          setPendingCreate(null);
          setUnknownCreate(false);
        } else {
          setSaveError(
            res?.status === 'denied' && !retryingUnknown
              ? m['clientNotes.permissionRefused']
              : m['clientNotes.saveError'],
          );
          if (res?.status === 'not_found' && retryingUnknown) {
            removePendingCreate(record);
            setIdempotencyKey(null);
            setPendingCreate(null);
            setUnknownCreate(false);
            setCreateEditorClosed(false);
            return;
          }
          const definiteRefusal =
            res?.status === 'denied' ||
            res?.status === 'invalid_input' ||
            res?.status === 'not_found';
          if (!definiteRefusal || retryingUnknown) {
            setUnknownCreate(true);
            setPendingCreate(record);
            // The identical recovery record was written before dispatch.
          } else {
            // A definite refusal before any retry resolves this create attempt.
            removePendingCreate(record);
            setIdempotencyKey(null);
            setPendingCreate(null);
            setUnknownCreate(false);
          }
        }
      } catch {
        if (
          isCurrentSession(requestGeneration) &&
          createRequestSequences.get(requestIdentity) === requestSequence
        ) {
          setSaveError(m['clientNotes.saveError']);
          setUnknownCreate(true);
          setPendingCreate(record);
        }
      } finally {
        if (!isCurrentSession(requestGeneration)) return;
        saveInFlight.current = false;
        saveInFlightNoteIdRef.current = null;
        setSavingNoteId(null);
        if (createRequestSequence.current === localSequence) setSaving(false);
        if (createRequestSequences.get(requestIdentity) === requestSequence)
          createRequestSequences.delete(requestIdentity);
      }
    },
    [
      draft,
      idempotencyKey,
      m,
      pendingCreate,
      props,
      removePendingCreate,
      setPendingCreate,
      unknownCreate,
      writePendingCreate,
      isCurrentSession,
    ],
  );

  const handleUpdate = async (noteId: string, retryBody?: string) => {
    if (saveInFlight.current || deletingNoteIdsRef.current.has(noteId)) return;
    const rawBody = retryBody ?? editDraft;
    const body = normalizeClientNoteBody(rawBody);
    const requestGeneration = editorGeneration.current;
    const sessionRequestGeneration = sessionGeneration.current;
    const ownsEditor = () =>
      activeEditorId.current === noteId &&
      editorGeneration.current === requestGeneration;
    if (body === null) {
      if (ownsEditor()) {
        if (rawBody.includes('\u0000'))
          setSaveError(m['clientNotes.saveError']);
        else if (rawBody.trim().length === 0)
          setSaveError(m['clientNotes.blankError']);
        else setSaveError(m['clientNotes.tooLongError']);
      }
      return;
    }
    saveInFlight.current = true;
    saveInFlightNoteIdRef.current = noteId;
    setSavingNoteId(noteId);
    setSaving(true);
    if (ownsEditor()) setSaveError(null);
    try {
      const res = await props.onUpdate?.(noteId, body);
      if (!isCurrentSession(sessionRequestGeneration)) return;
      if (res?.status === 'ok') {
        if (res.note?.id === noteId) {
          dispatchRecovery({
            type: 'edit-snapshot-upserted',
            scope: pageScope,
            note: res.note,
          });
        }
        props.onSuccess?.('edited');
        if (res.note?.id === noteId) {
          setPageState((current) => {
            if (current.scope !== pageScope) return current;
            const index = current.extra.findIndex((note) => note.id === noteId);
            if (index < 0) return current;
            const extra = [...current.extra];
            extra[index] = res.note!;
            return { ...current, extra };
          });
        }
        clearPendingEdit(noteId);
        if (ownsEditor()) {
          setActiveEditor(null);
          setEditingNoteSnapshot(null);
          setEditDraft('');
          setUnknownEdit(false);
          setSaveError(null);
        }
      } else {
        const unknown =
          res?.status !== 'denied' &&
          res?.status !== 'invalid_input' &&
          res?.status !== 'not_found';
        if (unknown) setPendingEdit({ noteId, body, status: 'unknown' });
        else if (retryBody !== undefined && res?.status === 'denied')
          setPendingEdit({ noteId, body, status: 'denied' });
        else clearPendingEdit(noteId);
        if (ownsEditor()) {
          setSaveError(
            res?.status === 'denied'
              ? m['clientNotes.permissionRefused']
              : m['clientNotes.saveError'],
          );
          setUnknownEdit(unknown);
        }
      }
    } catch {
      if (isCurrentSession(sessionRequestGeneration))
        setPendingEdit({ noteId, body, status: 'unknown' });
      if (isCurrentSession(sessionRequestGeneration) && ownsEditor()) {
        setSaveError(m['clientNotes.saveError']);
        setUnknownEdit(true);
      }
    } finally {
      if (!isCurrentSession(sessionRequestGeneration)) return;
      saveInFlight.current = false;
      saveInFlightNoteIdRef.current = null;
      setSavingNoteId(null);
      setSaving(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (
      deletingNoteIdsRef.current.has(noteId) ||
      saveInFlightNoteIdRef.current === noteId
    )
      return;
    deletingNoteIdsRef.current.add(noteId);
    const requestGeneration = sessionGeneration.current;
    setDeletingNoteIds((current) =>
      current.includes(noteId) ? current : [...current, noteId],
    );
    setDeleteTargetId(null);
    setDeleteError(null);
    try {
      const res = await props.onDelete?.(noteId);
      if (!isCurrentSession(requestGeneration)) return;
      if (res?.status === 'ok') {
        props.onSuccess?.('deleted');
        clearPendingEdit(noteId);
        if (activeEditorId.current === noteId) {
          setActiveEditor(null);
          setEditingNoteSnapshot(null);
          setEditDraft('');
          setUnknownEdit(false);
          setSaveError(null);
        }
        dispatchRecovery({ type: 'note-deleted', scope: pageScope, noteId });
        setPageState((current) => {
          if (current.scope !== pageScope) return current;
          return {
            ...current,
            extra: current.extra.filter((note) => note.id !== noteId),
            deletedIds: current.deletedIds.includes(noteId)
              ? current.deletedIds
              : [...current.deletedIds, noteId],
          };
        });
      } else {
        setDeleteError(
          res?.status === 'denied'
            ? m['clientNotes.permissionRefused']
            : m['clientNotes.deleteError'],
        );
      }
    } catch {
      if (isCurrentSession(requestGeneration))
        setDeleteError(m['clientNotes.deleteError']);
    } finally {
      if (isCurrentSession(requestGeneration)) {
        deletingNoteIdsRef.current.delete(noteId);
        setDeletingNoteIds((current) => current.filter((id) => id !== noteId));
      }
    }
  };

  const startEdit = (note: ClientNote) => {
    if (deletingNoteIdsRef.current.has(note.id)) return;
    if (
      editingId &&
      editingId !== note.id &&
      (saving || unknownEdit || editDraft !== editedNote?.body)
    ) {
      openExitWarning(
        saving ? 'inflight' : unknownEdit ? 'unknown' : 'unsaved',
        note.id,
      );
      return;
    }
    setActiveEditor(note.id);
    setEditingNoteSnapshot(note);
    setEditDraft(note.body);
    setSaveError(null);
    setUnknownEdit(false);
  };

  const cancelEdit = () => {
    if (saving || unknownEdit) {
      openExitWarning(saving ? 'inflight' : 'unknown');
      return;
    }
    if (editedNote && editDraft !== editedNote.body) {
      openExitWarning('unsaved');
      return;
    }
    setActiveEditor(null);
    setEditingNoteSnapshot(null);
    setEditDraft('');
    setUnknownEdit(false);
  };

  const confirmDiscard = () => {
    setExitOpen(false);
    const target = exitTarget;
    dispatchRecovery({ type: 'exit-target-cleared' });
    const continueNavigation = () => {
      const link = pendingNavigation.current;
      pendingNavigation.current = null;
      if (!link?.isConnected) return;
      allowNavigationClick.current = true;
      link.click();
      allowNavigationClick.current = false;
    };
    if (!target) {
      pendingNavigation.current = null;
      return;
    }
    if (target.kind === 'edit') {
      const stillOwnsTarget =
        editingId === target.noteId &&
        activeEditorId.current === target.noteId &&
        editorGeneration.current === target.generation &&
        editDraft === target.body;
      const currentEditNeedsDiscard =
        saving || unknownEdit || editDraft !== editedNote?.body;
      if (!stillOwnsTarget || !currentEditNeedsDiscard) {
        pendingNavigation.current = null;
        return;
      }
      if (target.switchTo) {
        const nextEditor = notes.find((note) => note.id === target.switchTo);
        if (!nextEditor) {
          return;
        }
        if (unknownEdit)
          setPendingEdit({
            noteId: target.noteId,
            body: editDraft,
            status: 'unknown',
          });
        setActiveEditor(nextEditor.id);
        setEditingNoteSnapshot(nextEditor);
        setEditDraft(nextEditor.body);
        setUnknownEdit(false);
        setSaveError(null);
        return;
      }
      if (unknownEdit)
        setPendingEdit({
          noteId: target.noteId,
          body: editDraft,
          status: 'unknown',
        });
      setActiveEditor(null);
      setEditingNoteSnapshot(null);
      setEditDraft('');
      setUnknownEdit(false);
      if (target.navigation) continueNavigation();
      return;
    }
    if (target.kind === 'pending') {
      const retainedIds = target.noteIds.filter((noteId) =>
        pendingEdits.some((pending) => pending.noteId === noteId),
      );
      for (const noteId of retainedIds) clearPendingEdit(noteId);
      if (target.navigation) continueNavigation();
      return;
    }
    const sameCreateDraft = draft === target.body;
    const createStillNeedsDiscard =
      sameCreateDraft &&
      (saving || unknownCreate || draft.length > 0 || pendingCreate !== null);
    if (!createStillNeedsDiscard) {
      pendingNavigation.current = null;
      return;
    }
    if (unknownCreate && pendingCreate) {
      setCreateEditorClosed(true);
      if (target.navigation) continueNavigation();
      return;
    }
    if (saving) {
      setCreateEditorClosed(true);
    } else {
      setDraft('');
      setIdempotencyKey(null);
      setCreateEditorClosed(true);
    }
    if (target.navigation) continueNavigation();
  };

  const stay = () => {
    setExitOpen(false);
    dispatchRecovery({ type: 'exit-target-cleared' });
    pendingNavigation.current = null;
  };

  const cancelCreate = () => {
    if (saving) {
      openExitWarning('inflight');
      return;
    }
    if (unknownCreate) {
      openExitWarning('unknown');
      return;
    }
    if (draft.trim().length > 0) {
      openExitWarning('unsaved');
      return;
    }
    setDraft('');
    setIdempotencyKey(null);
    setCreateEditorClosed(true);
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

      {deleteError && <Alert tone="error" title={deleteError} />}

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
                          {canEditNote(note, actorId, role) &&
                            pendingEdits.length === 0 && (
                              <Button
                                type="button"
                                disabled={
                                  deletingNoteIds.includes(note.id) ||
                                  savingNoteId === note.id
                                }
                                onClick={() => startEdit(note)}
                              >
                                {m['clientNotes.edit']}
                              </Button>
                            )}
                          {canDeleteNote(note, role) && (
                            <Button
                              type="button"
                              variant="destructive"
                              disabled={
                                deletingNoteIds.includes(note.id) ||
                                savingNoteId === note.id
                              }
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
              <Button
                type="button"
                disabled={saving}
                onClick={() => void handleCreate()}
              >
                {m['clientNotes.retry']}
              </Button>
            </Alert>
          )}

          {canCreate && !editingId && createEditorClosed && !unknownCreate && (
            <Button type="button" onClick={() => setCreateEditorClosed(false)}>
              {m['clientNotes.create']}
            </Button>
          )}

          {pendingEdits
            .filter((pending) => pending.noteId !== editingId)
            .map((pending) => (
              <Alert
                key={pending.noteId}
                tone="error"
                title={
                  pending.status === 'denied'
                    ? m['clientNotes.permissionRefused']
                    : m['clientNotes.saveError']
                }
              >
                <Button
                  type="button"
                  disabled={saving || deletingNoteIds.includes(pending.noteId)}
                  onClick={() =>
                    void handleUpdate(pending.noteId, pending.body)
                  }
                >
                  {m['clientNotes.retry']}
                </Button>
              </Alert>
            ))}

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

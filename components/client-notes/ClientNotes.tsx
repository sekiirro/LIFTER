'use client';

import { useCallback, useState, type FormEvent } from 'react';
import { Alert } from '../ui/Alert';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
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

export type ClientNotesProps = {
  locale?: Locale;
  messages?: ReturnType<typeof getMessages>;
  notes?: readonly ClientNote[];
  status?: ClientNotesStatus;
  error?: string | null;
  actorId?: string | null;
  role?: string | null;
  canCreate?: boolean;
  onRetryLoad?: () => void;
  onCreate?: (
    body: string,
    idempotencyKey: string,
  ) => Promise<{ status: string; note?: ClientNote; error?: string }>;
  onUpdate?: (
    noteId: string,
    body: string,
  ) => Promise<{ status: string; note?: ClientNote; error?: string }>;
  onDelete?: (
    noteId: string,
  ) => Promise<{ status: string; error?: string }>;
};

const PLATFORM_OWNER = 'platform_owner';

function canEditNote(note: ClientNote, actorId: string | null, role: string | null) {
  if (role === PLATFORM_OWNER) return true;
  return !!actorId && note.author_user_id === actorId;
}

function canDeleteNote(_note: ClientNote, role: string | null) {
  return role === PLATFORM_OWNER;
}

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ClientNotes(props: ClientNotesProps) {
  const locale = props.locale ?? 'ar';
  const m = props.messages ?? getMessages(locale);
  const dir = dirFor(locale);
  const notes = props.notes ?? [];
  const status = props.status ?? 'ready';
  const actorId = props.actorId ?? null;
  const role = props.role ?? null;
  const canCreate = props.canCreate ?? true;

  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitMode, setExitMode] = useState<'unsaved' | 'inflight' | 'unknown'>(
    'unsaved',
  );

  // dirty tracking handled by draft length

  const handleCreate = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const body = normalizeClientNoteBody(draft);
      if (body === null) {
        if (draft.trim().length === 0) setSaveError(m['clientNotes.blankError']);
        else setSaveError(m['clientNotes.tooLongError']);
        return;
      }
      const key = idempotencyKey ?? newIdempotencyKey();
      if (!idempotencyKey) setIdempotencyKey(key);
      setSaving(true);
      setSaveError(null);
      try {
        const res = await props.onCreate?.(body, key);
        if (res?.status === 'ok') {
          setDraft('');
          setIdempotencyKey(null);
        } else {
          setSaveError(res?.error ?? m['clientNotes.saveError']);
        }
      } catch {
        setSaveError(m['clientNotes.saveError']);
      } finally {
        setSaving(false);
      }
    },
    [draft, idempotencyKey, props, m],
  );

  const handleUpdate = useCallback(
    async (noteId: string) => {
      const body = normalizeClientNoteBody(editDraft);
      if (body === null) {
        if (editDraft.trim().length === 0) setSaveError(m['clientNotes.blankError']);
        else setSaveError(m['clientNotes.tooLongError']);
        return;
      }
      setSaving(true);
      setSaveError(null);
      try {
        const res = await props.onUpdate?.(noteId, body);
        if (res?.status === 'ok') {
          setEditingId(null);
          setEditDraft('');
        } else {
          setSaveError(res?.error ?? m['clientNotes.saveError']);
        }
      } catch {
        setSaveError(m['clientNotes.saveError']);
      } finally {
        setSaving(false);
      }
    },
    [editDraft, props, m],
  );

  const handleDelete = useCallback(
    async (noteId: string) => {
      if (!window.confirm(m['clientNotes.deleteDialogBody'])) return;
      try {
        const res = await props.onDelete?.(noteId);
        if (res?.status !== 'ok') {
          setSaveError(res?.error ?? m['clientNotes.deleteError']);
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
  };

  const cancelEdit = () => {
    if (editDraft.trim().length > 0) {
      setExitMode('unsaved');
      setExitOpen(true);
      return;
    }
    setEditingId(null);
    setEditDraft('');
  };

  const confirmDiscard = () => {
    setExitOpen(false);
    if (editingId) {
      setEditingId(null);
      setEditDraft('');
    } else {
      setDraft('');
      setIdempotencyKey(null);
    }
  };

  const stay = () => setExitOpen(false);

  const cancelCreate = () => {
    if (draft.trim().length > 0) {
      setExitMode('unsaved');
      setExitOpen(true);
      return;
    }
    setDraft('');
    setIdempotencyKey(null);
  };

  const counterText = (value: string) =>
    m['clientNotes.charCounter'].replace('{count}', String(Array.from(value).length));

  return (
    <section
      className={styles.root ?? ''}
      dir={dir}
      lang={locale === 'ar' ? 'ar' : 'en'}
      data-testid="client-notes"
    >
      <h2 className={styles.title ?? ''}>{m['clientNotes.tab']}</h2>

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
            <p className={styles.empty ?? ''}>{m['clientNotes.empty']}</p>
          )}

          {notes.length > 0 && (
            <ul className={styles.list ?? ''}>
              {notes.map((note) => {
                const editing = editingId === note.id;
                const authorLabel = note.author_user_id
                  ? note.author_user_id
                  : m['clientNotes.unavailableAuthor'];
                return (
                  <li key={note.id} className={styles.item ?? ''}>
                    <div className={styles.byline ?? ''}>
                      <Bidi>{m['clientNotes.byline'].replace('{author}', authorLabel).replace('{time}', note.created_at)}</Bidi>
                    </div>
                    {note.edited_at && (
                      <div className={styles.edited ?? ''}>
                        {m['clientNotes.editedMarker'].replace(
                          '{time}',
                          note.edited_at,
                        )}
                      </div>
                    )}
                    {editing ? (
                      <div className={styles.editForm ?? ''}>
                        <label className={styles.label ?? ''}>{m['clientNotes.noteLabel']}
                          <textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            aria-label={m['clientNotes.noteLabel']}
                            readOnly={saving}
                          />
                        </label>
                        <span className={styles.counter ?? ''}>
                          {counterText(editDraft)}
                        </span>
                        {saveError && (
                          <Alert tone="error" title={saveError} />
                        )}
                        <div className={styles.actions ?? ''}>
                          <Button
                            type="button"
                            onClick={() => handleUpdate(note.id)}
                            disabled={saving}
                          >
                            {saving
                              ? m['clientNotes.saving']
                              : m['clientNotes.saveChanges']}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={cancelEdit}
                            disabled={saving}
                          >
                            {m['clientNotes.cancel']}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={styles.body ?? ''}>
                          <Bidi>{note.body}</Bidi>
                        </div>
                        <div className={styles.actions ?? ''}>
                          {canEditNote(note, actorId, role) && (
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
                              onClick={() => handleDelete(note.id)}
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

          {canCreate && !editingId && (
            <>
              <Button type="button" className={styles.createButton ?? ''}>
                {m['clientNotes.create']}
              </Button>
              <form className={styles.createForm ?? ''} onSubmit={handleCreate}>
              <label className={styles.label ?? ''}>{m['clientNotes.noteLabel']}
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label={m['clientNotes.noteLabel']}
                  readOnly={saving}
                />
              </label>
              <span className={styles.counter ?? ''}>{counterText(draft)}</span>
              {saveError && <Alert tone="error" title={saveError} />}
              <div className={styles.actions ?? ''}>
                <Button type="submit" disabled={saving}>
                  {saving ? m['clientNotes.saving'] : m['clientNotes.saveNote']}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={cancelCreate}
                  disabled={saving}
                >
                  {m['clientNotes.cancel']}
                </Button>
              </div>
            </form>
            </>
          )}

          {exitOpen && (
            <div role="dialog" aria-modal="true" className={styles.dialog ?? ''}>
              <h3>{m['clientNotes.exitWarning.title']}</h3>
              <p>
                {exitMode === 'inflight'
                  ? m['clientNotes.exitWarning.bodyInFlight']
                  : exitMode === 'unknown'
                    ? m['clientNotes.saveError']
                    : m['clientNotes.exitWarning.body']}
              </p>
              <div className={styles.actions ?? ''}>
                <Button type="button" onClick={stay}>
                  {m['clientNotes.exitWarning.stay']}
                </Button>
                <Button type="button" onClick={confirmDiscard}>
                  {m['clientNotes.exitWarning.discard']}
                </Button>
              </div>
            </div>
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

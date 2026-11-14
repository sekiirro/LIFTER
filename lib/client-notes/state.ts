export type ClientNote = {
  id: string;
  workspace_id: string;
  client_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
};

export type PendingCreate = {
  tabId: string;
  actorId: string;
  clientId: string;
  workspaceId: string;
  text: string;
  body: string;
  idempotencyKey: string;
  retrySent: boolean;
};

export type PendingEdit = {
  noteId: string;
  body: string;
  status: 'unknown' | 'denied';
};

export type ExitTarget =
  | {
      kind: 'edit';
      noteId: string;
      generation: number;
      body: string;
      switchTo: string | null;
      navigation: boolean;
    }
  | {
      kind: 'create';
      body: string;
      navigation: boolean;
    }
  | {
      kind: 'pending';
      noteIds: readonly string[];
      navigation: boolean;
    };

export type ClientNotesState = {
  generation: number;
  mounted: boolean;
  actorId: string | null;
  pendingCreate: PendingCreate | null;
  pendingEdits: readonly PendingEdit[];
  exitTarget: ExitTarget | null;
  editedSnapshotScope: string;
  editedSnapshots: readonly ClientNote[];
};

export type ClientNotesEvent =
  | { type: 'session-mounted'; actorId: string | null }
  | { type: 'session-changed'; actorId: string | null }
  | { type: 'session-unmounted' }
  | { type: 'pending-create-set'; record: PendingCreate }
  | { type: 'pending-create-cleared' }
  | { type: 'pending-edit-set'; pending: PendingEdit }
  | { type: 'pending-edit-cleared'; noteId: string }
  | { type: 'pending-edits-cleared' }
  | { type: 'exit-target-set'; target: ExitTarget }
  | { type: 'exit-target-cleared' }
  | { type: 'edit-snapshot-upserted'; scope: string; note: ClientNote }
  | {
      type: 'first-page-refreshed';
      scope: string;
      notes: readonly ClientNote[];
      complete: boolean;
    }
  | { type: 'note-deleted'; scope: string; noteId: string };

export type ClientNotesEffect =
  | { type: 'clear-request-sequences' }
  | { type: 'clear-recovery-storage'; actorId: string | null };

export function createClientNotesState(
  actorId: string | null = null,
): ClientNotesState {
  return {
    generation: 0,
    mounted: true,
    actorId,
    pendingCreate: null,
    pendingEdits: [],
    exitTarget: null,
    editedSnapshotScope: '',
    editedSnapshots: [],
  };
}

export function transitionClientNotesState(
  state: ClientNotesState,
  event: ClientNotesEvent,
): { state: ClientNotesState; effects: readonly ClientNotesEffect[] } {
  switch (event.type) {
    case 'session-mounted':
      return {
        state: {
          ...state,
          generation: state.generation + 1,
          mounted: true,
          actorId: event.actorId,
        },
        effects: [],
      };
    case 'session-changed':
      if (state.actorId === event.actorId) return { state, effects: [] };
      return {
        state: {
          ...state,
          generation: state.generation + 1,
          actorId: event.actorId,
          pendingCreate: null,
          pendingEdits: [],
          exitTarget: null,
          editedSnapshotScope: '',
          editedSnapshots: [],
        },
        effects: [
          { type: 'clear-request-sequences' },
          { type: 'clear-recovery-storage', actorId: state.actorId },
        ],
      };
    case 'session-unmounted':
      return {
        state: { ...state, generation: state.generation + 1, mounted: false },
        effects: [{ type: 'clear-request-sequences' }],
      };
    case 'pending-create-set':
      return { state: { ...state, pendingCreate: event.record }, effects: [] };
    case 'pending-create-cleared':
      return { state: { ...state, pendingCreate: null }, effects: [] };
    case 'pending-edit-set':
      return {
        state: {
          ...state,
          pendingEdits: [
            ...state.pendingEdits.filter(
              (item) => item.noteId !== event.pending.noteId,
            ),
            event.pending,
          ],
        },
        effects: [],
      };
    case 'pending-edit-cleared':
      return {
        state: {
          ...state,
          pendingEdits: state.pendingEdits.filter(
            (item) => item.noteId !== event.noteId,
          ),
        },
        effects: [],
      };
    case 'pending-edits-cleared':
      return { state: { ...state, pendingEdits: [] }, effects: [] };
    case 'exit-target-set':
      return { state: { ...state, exitTarget: event.target }, effects: [] };
    case 'exit-target-cleared':
      return { state: { ...state, exitTarget: null }, effects: [] };
    case 'edit-snapshot-upserted':
      return {
        state: {
          ...state,
          editedSnapshotScope: event.scope,
          editedSnapshots: [
            ...(state.editedSnapshotScope === event.scope
              ? state.editedSnapshots.filter(
                  (note) => note.id !== event.note.id,
                )
              : []),
            event.note,
          ],
        },
        effects: [],
      };
    case 'first-page-refreshed':
      if (!event.complete) return { state, effects: [] };
      return {
        state: {
          ...state,
          editedSnapshotScope: event.scope,
          editedSnapshots:
            state.editedSnapshotScope === event.scope
              ? state.editedSnapshots.filter((note) =>
                  event.notes.some((current) => current.id === note.id),
                )
              : [],
        },
        effects: [],
      };
    case 'note-deleted':
      return {
        state: {
          ...state,
          pendingEdits: state.pendingEdits.filter(
            (pending) => pending.noteId !== event.noteId,
          ),
          editedSnapshots:
            state.editedSnapshotScope === event.scope
              ? state.editedSnapshots.filter((note) => note.id !== event.noteId)
              : state.editedSnapshots,
        },
        effects: [],
      };
  }
}

export function clientNotesReducer(
  state: ClientNotesState,
  event: ClientNotesEvent,
): ClientNotesState {
  return transitionClientNotesState(state, event).state;
}

export const createRequestSequences = new Map<string, number>();
let nextCreateRequestSequence = 0;

export function nextClientNotesRequestSequence() {
  return ++nextCreateRequestSequence;
}

export function clearClientNotesRequestSequences() {
  createRequestSequences.clear();
  nextCreateRequestSequence = 0;
}

export type ClientNotesMachineState = {
  generation: number;
  mounted: boolean;
  signedOut: boolean;
  createDraft: string;
  activeEdit: { noteId: string; original: string; body: string } | null;
  pendingCreateBody: string | null;
  pendingEdits: readonly { noteId: string; body: string }[];
  inFlight: readonly {
    requestId: string;
    kind: 'create' | 'edit' | 'retry' | 'delete';
    noteId: string | null;
    body: string;
    generation: number;
  }[];
  firstPageIds: readonly string[];
  continuationIds: readonly string[];
  deletedIds: readonly string[];
  exitTarget: ExitTarget | null;
  navigationAllowed: number;
};

export type ClientNotesMachineEvent =
  | { type: 'create'; body: string }
  | { type: 'edit'; noteId: string; original: string; body: string }
  | { type: 'edit-text'; body: string }
  | {
      type: 'save-start' | 'retry-start';
      requestId: string;
      kind: 'create' | 'edit' | 'retry';
      noteId: string | null;
      body: string;
    }
  | {
      type: 'save-settle';
      requestId: string;
      outcome: 'ok' | 'unknown' | 'denied' | 'invalid';
      savedNoteId?: string;
    }
  | { type: 'delete-start'; requestId: string; noteId: string }
  | {
      type: 'delete-settle';
      requestId: string;
      noteId: string;
      outcome: 'ok' | 'fail';
    }
  | { type: 'load-more'; noteIds: readonly string[] }
  | {
      type: 'first-page-refresh';
      noteIds: readonly string[];
      complete: boolean;
    }
  | { type: 'navigation-attempt'; navigation: boolean }
  | { type: 'discard' }
  | { type: 'sign-out' }
  | { type: 'unmount' }
  | { type: 'mount' };

export type ClientNotesMachineEffect =
  | { type: 'write-recovery'; body: string; generation: number }
  | { type: 'clear-request-sequences' }
  | { type: 'navigate' };

export function createClientNotesMachineState(): ClientNotesMachineState {
  return {
    generation: 0,
    mounted: true,
    signedOut: false,
    createDraft: '',
    activeEdit: null,
    pendingCreateBody: null,
    pendingEdits: [],
    inFlight: [],
    firstPageIds: [],
    continuationIds: [],
    deletedIds: [],
    exitTarget: null,
    navigationAllowed: 0,
  };
}

function replaceNoteIds(
  current: readonly string[],
  incoming: readonly string[],
) {
  const seen = new Set<string>();
  return [...incoming, ...current].filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function clientNotesHasUnsavedWork(state: {
  createDraft: string;
  activeEdit: { original: string; body: string } | null;
  pendingCreateBody: string | null;
  pendingEdits: readonly unknown[];
  inFlight: readonly unknown[];
}) {
  return (
    state.createDraft.length > 0 ||
    (!!state.activeEdit &&
      state.activeEdit.original !== state.activeEdit.body) ||
    state.pendingCreateBody !== null ||
    state.pendingEdits.length > 0 ||
    state.inFlight.length > 0
  );
}

export function transitionClientNotesMachine(
  state: ClientNotesMachineState,
  event: ClientNotesMachineEvent,
): {
  state: ClientNotesMachineState;
  effects: readonly ClientNotesMachineEffect[];
} {
  const active = state.mounted && !state.signedOut;
  switch (event.type) {
    case 'mount':
      return {
        state: {
          ...state,
          generation: state.generation + 1,
          mounted: true,
          signedOut: false,
        },
        effects: [],
      };
    case 'sign-out':
    case 'unmount':
      return {
        state: {
          ...state,
          generation: state.generation + 1,
          mounted: event.type === 'sign-out' ? state.mounted : false,
          signedOut: event.type === 'sign-out' || state.signedOut,
          inFlight: [],
        },
        effects: [{ type: 'clear-request-sequences' }],
      };
    case 'create':
      if (
        !active ||
        state.inFlight.some(
          (request) =>
            request.kind === 'create' ||
            (request.kind === 'retry' && request.noteId === null),
        )
      )
        return { state, effects: [] };
      return {
        state: {
          ...state,
          createDraft: event.body,
          pendingCreateBody:
            state.pendingCreateBody === event.body
              ? state.pendingCreateBody
              : null,
        },
        effects: [],
      };
    case 'edit':
      if (
        !active ||
        (state.activeEdit &&
          state.activeEdit.body !== state.activeEdit.original) ||
        state.inFlight.some((request) => request.noteId === event.noteId)
      )
        return { state, effects: [] };
      return {
        state: {
          ...state,
          activeEdit: {
            noteId: event.noteId,
            original: event.original,
            body: event.body,
          },
        },
        effects: [],
      };
    case 'edit-text':
      if (
        !active ||
        !state.activeEdit ||
        state.inFlight.some(
          (request) => request.noteId === state.activeEdit?.noteId,
        )
      )
        return { state, effects: [] };
      return {
        state: {
          ...state,
          activeEdit: { ...state.activeEdit, body: event.body },
        },
        effects: [],
      };
    case 'save-start':
    case 'retry-start':
      if (
        !active ||
        state.inFlight.some(
          (request) => request.requestId === event.requestId,
        ) ||
        state.inFlight.some((request) => request.kind !== 'delete') ||
        (event.kind === 'create' && state.pendingCreateBody !== null) ||
        (event.kind === 'retry' &&
          event.noteId === null &&
          state.pendingCreateBody !== null &&
          state.pendingCreateBody !== event.body) ||
        (event.kind === 'edit' &&
          (!state.activeEdit || state.activeEdit.noteId !== event.noteId)) ||
        (event.kind === 'edit' && state.pendingEdits.length > 0)
      )
        return { state, effects: [] };
      return {
        state: {
          ...state,
          inFlight: [
            ...state.inFlight,
            { ...event, generation: state.generation },
          ],
          pendingCreateBody:
            (event.kind === 'create' ||
              (event.kind === 'retry' && event.noteId === null)) &&
            state.pendingCreateBody === null
              ? event.body
              : state.pendingCreateBody,
          createDraft:
            event.kind === 'create' ||
            (event.kind === 'retry' && event.noteId === null)
              ? event.body
              : state.createDraft,
          activeEdit:
            event.kind === 'edit' && state.activeEdit?.noteId === event.noteId
              ? { ...state.activeEdit, body: event.body }
              : state.activeEdit,
          pendingEdits:
            event.kind === 'retry' && event.noteId !== null
              ? [
                  ...state.pendingEdits.filter(
                    (item) => item.noteId !== event.noteId,
                  ),
                  { noteId: event.noteId, body: event.body },
                ]
              : state.pendingEdits,
        },
        effects:
          event.kind === 'create'
            ? [
                {
                  type: 'write-recovery',
                  body: event.body,
                  generation: state.generation,
                },
              ]
            : [],
      };
    case 'save-settle': {
      const request = state.inFlight.find(
        (item) => item.requestId === event.requestId,
      );
      if (
        !active ||
        !request ||
        request.kind === 'delete' ||
        request.generation !== state.generation
      )
        return { state, effects: [] };
      const inFlight = state.inFlight.filter(
        (item) => item.requestId !== event.requestId,
      );
      if (
        request.kind === 'create' ||
        (request.kind === 'retry' && request.noteId === null)
      ) {
        if (event.outcome === 'ok')
          return {
            state: {
              ...state,
              inFlight,
              createDraft: '',
              pendingCreateBody: null,
            },
            effects: [],
          };
        return {
          state: {
            ...state,
            inFlight,
            createDraft:
              event.outcome === 'denied' || event.outcome === 'invalid'
                ? request.body
                : state.createDraft,
            pendingCreateBody:
              event.outcome === 'unknown' || request.kind === 'retry'
                ? request.body
                : null,
          },
          effects: [],
        };
      }
      if (event.outcome === 'ok') {
        const noteId = event.savedNoteId ?? request.noteId;
        return {
          state: {
            ...state,
            inFlight,
            activeEdit:
              state.activeEdit?.noteId === noteId ? null : state.activeEdit,
            pendingEdits: state.pendingEdits.filter(
              (item) => item.noteId !== noteId,
            ),
          },
          effects: [],
        };
      }
      if (event.outcome === 'unknown' || request.kind === 'retry') {
        const noteId = request.noteId;
        return {
          state: {
            ...state,
            inFlight,
            pendingEdits:
              noteId === null
                ? state.pendingEdits
                : [
                    ...state.pendingEdits.filter(
                      (item) => item.noteId !== noteId,
                    ),
                    { noteId, body: request.body },
                  ],
          },
          effects: [],
        };
      }
      return { state: { ...state, inFlight }, effects: [] };
    }
    case 'delete-start':
      if (
        !active ||
        state.inFlight.some((item) => item.requestId === event.requestId)
      )
        return { state, effects: [] };
      return {
        state: {
          ...state,
          inFlight: [
            ...state.inFlight,
            {
              requestId: event.requestId,
              kind: 'delete',
              noteId: event.noteId,
              body: '',
              generation: state.generation,
            },
          ],
        },
        effects: [],
      };
    case 'delete-settle': {
      const request = state.inFlight.find(
        (item) => item.requestId === event.requestId,
      );
      if (
        !active ||
        !request ||
        request.kind !== 'delete' ||
        request.generation !== state.generation
      )
        return { state, effects: [] };
      const inFlight = state.inFlight.filter(
        (item) => item.requestId !== event.requestId,
      );
      if (event.outcome !== 'ok')
        return { state: { ...state, inFlight }, effects: [] };
      return {
        state: {
          ...state,
          inFlight,
          firstPageIds: state.firstPageIds.filter((id) => id !== event.noteId),
          continuationIds: state.continuationIds.filter(
            (id) => id !== event.noteId,
          ),
          deletedIds: state.deletedIds.includes(event.noteId)
            ? state.deletedIds
            : [...state.deletedIds, event.noteId],
          pendingEdits: state.pendingEdits.filter(
            (item) => item.noteId !== event.noteId,
          ),
          activeEdit:
            state.activeEdit?.noteId === event.noteId ? null : state.activeEdit,
        },
        effects: [],
      };
    }
    case 'load-more':
      if (!active) return { state, effects: [] };
      return {
        state: {
          ...state,
          continuationIds: replaceNoteIds(
            state.continuationIds,
            event.noteIds.filter(
              (id) =>
                !state.firstPageIds.includes(id) &&
                !state.deletedIds.includes(id),
            ),
          ),
        },
        effects: [],
      };
    case 'first-page-refresh': {
      if (!active) return { state, effects: [] };
      const firstPageIds = event.noteIds.filter(
        (id) => !state.deletedIds.includes(id),
      );
      return {
        state: {
          ...state,
          firstPageIds: replaceNoteIds([], firstPageIds),
          continuationIds: [],
          pendingEdits: state.pendingEdits,
        },
        effects: [],
      };
    }
    case 'navigation-attempt': {
      if (!active) return { state, effects: [] };
      const navigation = event.navigation;
      const target: ExitTarget | null = state.activeEdit
        ? {
            kind: 'edit',
            noteId: state.activeEdit.noteId,
            generation: state.generation,
            body: state.activeEdit.body,
            switchTo: null,
            navigation,
          }
        : state.createDraft.length > 0 || state.pendingCreateBody !== null
          ? { kind: 'create', body: state.createDraft, navigation }
          : state.pendingEdits.length > 0
            ? {
                kind: 'pending',
                noteIds: state.pendingEdits.map((pending) => pending.noteId),
                navigation,
              }
            : null;
      return {
        state: {
          ...state,
          exitTarget: target,
          navigationAllowed: target
            ? state.navigationAllowed
            : state.navigationAllowed + 1,
        },
        effects: target ? [] : navigation ? [{ type: 'navigate' }] : [],
      };
    }
    case 'discard': {
      const target = state.exitTarget;
      if (!target || !active) return { state, effects: [] };
      let next = state;
      if (target.kind === 'create' && state.createDraft === target.body) {
        next = { ...next, createDraft: '', pendingCreateBody: null };
      } else if (
        target.kind === 'edit' &&
        state.activeEdit?.noteId === target.noteId
      ) {
        next = { ...next, activeEdit: null };
      } else if (target.kind === 'pending') {
        next = {
          ...next,
          pendingEdits: state.pendingEdits.filter(
            (pending) => !target.noteIds.includes(pending.noteId),
          ),
        };
      }
      return {
        state: {
          ...next,
          exitTarget: null,
          navigationAllowed:
            target.navigation &&
            (target.kind === 'pending' ||
              target.kind === 'create' ||
              target.kind === 'edit')
              ? next.navigationAllowed + 1
              : next.navigationAllowed,
        },
        effects: target.navigation ? [{ type: 'navigate' }] : [],
      };
    }
  }
}

export function clientNotesVisibleIds(state: ClientNotesMachineState) {
  return replaceNoteIds([], [...state.firstPageIds, ...state.continuationIds]);
}

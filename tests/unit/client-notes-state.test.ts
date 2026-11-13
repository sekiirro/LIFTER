import { describe, expect, it } from 'vitest';
import {
  clientNotesHasUnsavedWork,
  clientNotesVisibleIds,
  clientNotesReducer,
  createClientNotesState,
  createClientNotesMachineState,
  transitionClientNotesState,
  transitionClientNotesMachine,
  type ClientNotesMachineEvent,
  type ClientNotesMachineState,
} from '../../lib/client-notes/state';

function randomFor(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function retainedTexts(state: ClientNotesMachineState) {
  return [
    state.createDraft,
    state.activeEdit?.body,
    state.pendingCreateBody,
    ...state.pendingEdits.map((edit) => edit.body),
    ...state.inFlight.map((request) => request.body),
  ].filter(
    (text): text is string => typeof text === 'string' && text.length > 0,
  );
}

function nextEvent(
  random: () => number,
  state: ClientNotesMachineState,
  sequence: number,
): ClientNotesMachineEvent {
  const choose = (max: number) => Math.floor(random() * max);
  const notes = ['n1', 'n2', 'n3', 'n4'];
  const noteId = notes[choose(notes.length)]!;
  const body = `draft-${sequence}`;
  switch (choose(17)) {
    case 0:
      return { type: 'create', body };
    case 1:
      return { type: 'edit', noteId, original: `saved-${noteId}`, body };
    case 2:
      return { type: 'edit-text', body };
    case 3:
    case 4: {
      const retry = random() < 0.5;
      const kind = retry ? 'retry' : random() < 0.5 ? 'create' : 'edit';
      const retryBody =
        kind === 'retry'
          ? (state.pendingEdits.find((pending) => pending.noteId === noteId)
              ?.body ??
            state.pendingCreateBody ??
            body)
          : body;
      return {
        type: retry ? 'retry-start' : 'save-start',
        requestId: `request-${sequence}`,
        kind,
        noteId:
          kind === 'create' || (kind === 'retry' && state.pendingCreateBody)
            ? null
            : noteId,
        body:
          kind === 'edit' && state.activeEdit
            ? state.activeEdit.body
            : kind === 'create' && state.createDraft.length > 0
              ? state.createDraft
              : retryBody,
      };
    }
    case 5: {
      const request =
        state.inFlight[choose(Math.max(1, state.inFlight.length))];
      return {
        type: 'save-settle',
        requestId: request?.requestId ?? `missing-${sequence}`,
        outcome: (['ok', 'unknown', 'denied', 'invalid'] as const)[choose(4)]!,
        ...(random() < 0.5 ? { savedNoteId: noteId } : {}),
      };
    }
    case 6:
      return { type: 'delete-start', requestId: `delete-${sequence}`, noteId };
    case 7: {
      const request = state.inFlight.find((item) => item.kind === 'delete');
      return {
        type: 'delete-settle',
        requestId: request?.requestId ?? `missing-delete-${sequence}`,
        noteId: request?.noteId ?? noteId,
        outcome: random() < 0.5 ? 'ok' : 'fail',
      };
    }
    case 8:
      return {
        type: 'load-more',
        noteIds: [noteId, notes[choose(notes.length)]!],
      };
    case 9:
      return {
        type: 'first-page-refresh',
        noteIds: random() < 0.5 ? [noteId, notes[choose(notes.length)]!] : [],
        complete: random() < 0.5,
      };
    case 10:
      return { type: 'navigation-attempt', navigation: true };
    case 11:
      return { type: 'discard' };
    case 12:
      return { type: 'sign-out' };
    case 13:
      return { type: 'mount' };
    case 14:
      return { type: 'unmount' };
    case 15:
      return {
        type: 'retry-start',
        requestId: `retry-${sequence}`,
        kind: 'retry',
        noteId,
        body:
          state.pendingEdits.find((pending) => pending.noteId === noteId)
            ?.body ?? body,
      };
    default:
      return { type: 'load-more', noteIds: notes };
  }
}

describe('Client Notes pure state transitions', () => {
  it('drops completed edit snapshots only after a complete first-page refresh', () => {
    const savedNote = {
      id: 'saved-old-note',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'actor',
      body: 'saved body',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: '2026-11-13T09:00:00Z',
    };
    const base = clientNotesReducer(createClientNotesState(), {
      type: 'edit-snapshot-upserted',
      scope: 'scope',
      note: savedNote,
    });
    const incomplete = clientNotesReducer(base, {
      type: 'first-page-refreshed',
      scope: 'scope',
      notes: [],
      complete: false,
    });
    expect(incomplete.editedSnapshots).toEqual([savedNote]);
    const complete = clientNotesReducer(incomplete, {
      type: 'first-page-refreshed',
      scope: 'scope',
      notes: [],
      complete: true,
    });
    expect(complete.editedSnapshots).toEqual([]);
  });

  it('invalidates recovery and request ownership on account changes', () => {
    const base = createClientNotesState('actor-a');
    const { state, effects } = transitionClientNotesState(
      {
        ...base,
        generation: 4,
        pendingCreate: {
          tabId: 'tab',
          actorId: 'actor-a',
          clientId: 'client',
          workspaceId: 'workspace',
          text: 'pending create',
          body: 'pending create',
          idempotencyKey: 'key',
          retrySent: true,
        },
        pendingEdits: [
          { noteId: 'n1', body: 'pending edit', status: 'unknown' },
        ],
        exitTarget: { kind: 'pending', noteIds: ['n1'], navigation: true },
      },
      { type: 'session-changed', actorId: 'actor-b' },
    );

    expect(state.generation).toBe(5);
    expect(state.pendingCreate).toBeNull();
    expect(state.pendingEdits).toEqual([]);
    expect(state.exitTarget).toBeNull();
    expect(effects).toEqual([
      { type: 'clear-request-sequences' },
      { type: 'clear-recovery-storage', actorId: 'actor-a' },
    ]);
  });

  it('preserves transition invariants across 1,000 seeded random interleavings', () => {
    const coverage = new Set<string>();
    for (let seed = 1; seed <= 1_000; seed += 1) {
      let state = createClientNotesMachineState();
      const random = randomFor(seed);
      for (let step = 0; step < 48; step += 1) {
        const event = nextEvent(random, state, seed * 48 + step);
        coverage.add(event.type);
        if (event.type === 'save-settle') coverage.add(`save:${event.outcome}`);
        if (event.type === 'delete-settle')
          coverage.add(`delete:${event.outcome}`);
        if (event.type === 'first-page-refresh')
          coverage.add(`refresh:${event.complete ? 'complete' : 'incomplete'}`);
        const previousTexts = retainedTexts(state);
        const { state: next, effects } = transitionClientNotesMachine(
          state,
          event,
        );

        const explicitResolution =
          event.type === 'discard' ||
          event.type === 'sign-out' ||
          event.type === 'unmount' ||
          event.type === 'mount' ||
          (event.type === 'save-settle' && event.outcome === 'ok') ||
          (event.type === 'delete-settle' && event.outcome === 'ok');
        if (
          event.type !== 'create' &&
          event.type !== 'edit' &&
          event.type !== 'edit-text' &&
          !explicitResolution
        ) {
          const retained = retainedTexts(next);
          for (const text of previousTexts)
            expect(
              retained,
              `seed=${seed} step=${step} event=${JSON.stringify(event)} previous=${JSON.stringify({ createDraft: state.createDraft, activeEdit: state.activeEdit, pendingCreateBody: state.pendingCreateBody, pendingEdits: state.pendingEdits, inFlight: state.inFlight })} next=${JSON.stringify({ createDraft: next.createDraft, activeEdit: next.activeEdit, pendingCreateBody: next.pendingCreateBody, pendingEdits: next.pendingEdits, inFlight: next.inFlight })}`,
            ).toContain(text);
        }

        if (!next.mounted || next.signedOut)
          expect(
            effects.some((effect) => effect.type === 'write-recovery'),
          ).toBe(false);

        const visible = clientNotesVisibleIds(next);
        expect(new Set(visible).size).toBe(visible.length);
        for (const id of [...next.firstPageIds, ...next.continuationIds]) {
          expect(visible).toContain(id);
          expect(next.deletedIds).not.toContain(id);
        }
        if (event.type === 'load-more' && state.mounted && !state.signedOut) {
          for (const id of event.noteIds) {
            if (!next.deletedIds.includes(id)) expect(visible).toContain(id);
          }
        }
        if (
          event.type === 'first-page-refresh' &&
          state.mounted &&
          !state.signedOut
        ) {
          for (const id of event.noteIds) {
            if (!next.deletedIds.includes(id)) expect(visible).toContain(id);
          }
        }
        if (
          event.type === 'delete-settle' &&
          event.outcome === 'ok' &&
          state.mounted &&
          !state.signedOut &&
          state.inFlight.some(
            (request) =>
              request.requestId === event.requestId &&
              request.kind === 'delete' &&
              request.generation === state.generation,
          )
        )
          expect(visible).not.toContain(event.noteId);
        if (event.type === 'first-page-refresh' && event.complete) {
          for (const deletedId of next.deletedIds)
            expect(visible).not.toContain(deletedId);
        }

        const independentlyComputedGuard =
          next.createDraft.length > 0 ||
          (!!next.activeEdit &&
            next.activeEdit.original !== next.activeEdit.body) ||
          next.pendingCreateBody !== null ||
          next.pendingEdits.length > 0 ||
          next.inFlight.length > 0;
        expect(clientNotesHasUnsavedWork(next)).toBe(
          independentlyComputedGuard,
        );

        state = next;
      }
    }
    for (const eventType of [
      'create',
      'edit',
      'save-start',
      'save-settle',
      'retry-start',
      'delete-start',
      'delete-settle',
      'load-more',
      'first-page-refresh',
      'navigation-attempt',
      'discard',
      'sign-out',
      'unmount',
      'mount',
    ])
      expect(coverage).toContain(eventType);
    for (const outcome of ['ok', 'unknown', 'denied', 'invalid'])
      expect(coverage).toContain(`save:${outcome}`);
    for (const outcome of ['ok', 'fail'])
      expect(coverage).toContain(`delete:${outcome}`);
    expect(coverage).toContain('refresh:complete');
    expect(coverage).toContain('refresh:incomplete');
  }, 30_000);
});

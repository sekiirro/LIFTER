/** @vitest-environment happy-dom */
import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExerciseDetailRemove } from '../../components/catalog/ExerciseDetailRemove';
import { en } from '../../lib/i18n/messages/en';

const removeAction = vi.hoisted(() => vi.fn());
vi.mock('../../app/(app)/exercise-library/actions', () => ({
  removeExerciseAction: removeAction,
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.clearAllMocks();
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(
    function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  );
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.removeAttribute('open');
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

async function render() {
  await act(async () =>
    root.render(
      createElement(ExerciseDetailRemove, {
        locale: 'en',
        scope: 'workspace',
        workspaceId: '22222222-2222-4222-8222-222222222222',
        exerciseId: '55555555-5555-4555-8555-555555555555',
        expectedRevision: 4,
      }),
    ),
  );
}
function button(label: string) {
  const match = [...host.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label,
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

describe('Exercise Detail Remove confirmation', () => {
  it('requires confirmation; cancel leaves the action untouched', async () => {
    await render();
    await act(async () => button(en['catalog.editorRemove']).click());
    expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(button(en['dialog.confirm'])).toBeTruthy();
    await act(async () => button(en['dialog.cancel']).click());
    expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(removeAction).not.toHaveBeenCalled();
  });

  it('calls Remove only after confirmation and renders the existing result state', async () => {
    removeAction.mockResolvedValue({
      status: 'ok',
      data: { lifecycle_state: 'removed' },
    });
    await render();
    await act(async () => button(en['catalog.editorRemove']).click());
    await act(async () => button(en['dialog.confirm']).click());
    expect(removeAction).toHaveBeenCalledWith({
      scope: 'workspace',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      exerciseId: '55555555-5555-4555-8555-555555555555',
      expectedRevision: 4,
      operationKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    });
    expect(host.textContent).toContain(en['catalog.editorLifecycleRemoved']);
  });

  it('keeps the dialog open and shows the removal failure inside it so the user can retry', async () => {
    removeAction.mockResolvedValue({ status: 'unavailable' });
    await render();
    await act(async () => button(en['catalog.editorRemove']).click());
    await act(async () => button(en['dialog.confirm']).click());
    const dialog = host.querySelector('dialog');
    expect(dialog?.hasAttribute('open')).toBe(true);
    expect(dialog?.querySelector('[role="alert"]')?.textContent).toBe(
      en['states.error.description'],
    );
    expect(dialog?.querySelector('[role="alert"]')).toBeTruthy();
    expect(button(en['dialog.confirm'])).toBeTruthy();
  });

  it('clears the failure alert when the dialog is closed and reopened', async () => {
    removeAction.mockResolvedValue({ status: 'unavailable' });
    await render();
    await act(async () => button(en['catalog.editorRemove']).click());
    await act(async () => button(en['dialog.confirm']).click());
    expect(host.querySelector('dialog [role="alert"]')).toBeTruthy();
    await act(async () => button(en['dialog.cancel']).click());
    expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    removeAction.mockClear();
    await act(async () => button(en['catalog.editorRemove']).click());
    const dialog = host.querySelector('dialog');
    expect(dialog?.hasAttribute('open')).toBe(true);
    expect(dialog?.querySelector('[role="alert"]')).toBeFalsy();
    expect(removeAction).not.toHaveBeenCalled();
  });

  it('maps the pending live region to a visually-hidden CSS-module class', async () => {
    await render();
    const liveRegion = host.querySelector('[aria-live="polite"]');
    expect(liveRegion?.className).toBeTruthy();
    expect(liveRegion?.className).not.toBe('undefined');
    const styles = readFileSync(
      'components/catalog/ExerciseDetailView.module.css',
      'utf8',
    );
    expect(styles).toMatch(/\.srOnly\s*\{[^}]*position:\s*absolute/s);
    expect(styles).toMatch(
      /\.srOnly\s*\{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/s,
    );
  });
});

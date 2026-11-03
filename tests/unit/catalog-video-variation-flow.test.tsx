import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoVariationFlow } from '../../components/catalog/VideoVariationFlow';

const { load, save } = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('../../app/(dashboard)/catalog-variations/actions', () => ({
  loadWorkspaceVideoVariationsAction: load,
  saveVideoVariationAction: save,
}));

let dom: Window;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  dom = new Window();
  vi.stubGlobal('window', dom);
  vi.stubGlobal('document', dom.document);
  vi.stubGlobal('HTMLElement', dom.HTMLElement);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const element = dom.document.createElement('div');
  dom.document.body.append(element);
  container = element as unknown as HTMLElement;
  root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  load.mockReset();
  save.mockReset();
  save.mockResolvedValue({ status: 'ok', data: {} });
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.happyDOM.abort();
  vi.unstubAllGlobals();
});

describe('variation mapping load failures', () => {
  it.each([
    ['thrown', () => load.mockRejectedValueOnce(new Error('load failed'))],
    ['non-ok', () => load.mockResolvedValueOnce({ status: 'unavailable' })],
  ])(
    'clears the selected exercise and blocks save after a %s load failure',
    async (_kind, setup) => {
      setup();
      await act(async () => {
        root.render(
          createElement(VideoVariationFlow, {
            locale: 'en',
            initialWorkspaceId: 'workspace-selected',
            workspaces: [
              { id: 'workspace-selected', label: 'Selected workspace' },
            ],
            exercises: [{ id: 'exercise-a', label: 'Exercise A' }],
          }),
        );
      });

      const exercise = container.querySelector<HTMLSelectElement>(
        'select[id$="-exercise"]',
      );
      expect(exercise).not.toBeNull();
      await act(async () => {
        exercise!.value = 'exercise-a';
        exercise!.dispatchEvent(new dom.Event('change', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      const selectedAfterFailure = container.querySelector<HTMLSelectElement>(
        'select[id$="-exercise"]',
      );
      expect(selectedAfterFailure?.value).toBe('');
      expect(container.querySelector('[role="alert"]')).not.toBeNull();

      await act(async () => {
        container
          .querySelector('form')
          ?.dispatchEvent(
            new dom.Event('submit', { bubbles: true, cancelable: true }),
          );
        await Promise.resolve();
      });
      expect(save).not.toHaveBeenCalled();
    },
  );
});

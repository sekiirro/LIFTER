/** @vitest-environment happy-dom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DraftPublishBar,
  type DraftPublishBarProps,
} from '../../components/workout-planner/DraftPublishBar';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

const onSaveDraft = vi.fn();
const onPublish = vi.fn();
const onReload = vi.fn();

const BASE: DraftPublishBarProps = {
  locale: 'en',
  saving: false,
  dirty: false,
  lastSaved: 'none',
  saveError: 'none',
  publishing: false,
  canPublish: true,
  onPublish,
  onReload,
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function render(props: Partial<DraftPublishBarProps> = {}) {
  await act(async () =>
    root.render(createElement(DraftPublishBar, { ...BASE, ...props })),
  );
}

function statusText(): string | null {
  const region = host.querySelector('[data-testid="draft-save-status"]');
  if (!region) throw new Error('Missing save status region');
  const text = region.textContent?.trim() ?? '';
  return text === '' ? null : text;
}

function buttons(): HTMLButtonElement[] {
  return [...host.querySelectorAll('button')] as HTMLButtonElement[];
}

function buttonByLabel(label: string): HTMLButtonElement {
  const match = buttons().find((item) => item.textContent?.trim() === label);
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

function buttonContaining(label: string): HTMLButtonElement {
  const match = buttons().find((item) => item.textContent?.includes(label));
  if (!match) throw new Error(`Missing button containing: ${label}`);
  return match;
}

describe('F17 T042 DraftPublishBar (FR-015; SC-006)', () => {
  it('renders every autosave indicator state with PO-approved EN strings', async () => {
    await render({ saving: true });
    expect(statusText()).toBe(en['forms.saving']);

    await render({ dirty: true });
    expect(statusText()).toBe(en['forms.unsaved']);

    await render({ lastSaved: 'draft' });
    expect(statusText()).toBe(en['forms.draftSaved']);

    await render({ lastSaved: 'all' });
    expect(statusText()).toBe(en['planner.allSaved']);

    await render({ saveError: 'failed' });
    expect(statusText()).toBe(en['forms.saveFailed']);

    await render({});
    expect(statusText()).toBeNull();
  });

  it('renders AR RTL with byte-exact strings and keeps the region live', async () => {
    await render({ locale: 'ar', saving: true });
    const bar = host.querySelector('[data-testid="draft-publish-bar"]');
    expect(bar?.getAttribute('dir')).toBe('rtl');
    expect(bar?.getAttribute('lang')).toBe('ar');
    expect(statusText()).toBe(ar['forms.saving']);

    await render({ locale: 'ar', lastSaved: 'all' });
    expect(statusText()).toBe(ar['planner.allSaved']);

    await render({ locale: 'ar', saveError: 'failed' });
    expect(statusText()).toBe(ar['forms.saveFailed']);

    const region = host.querySelector('[data-testid="draft-save-status"]');
    expect(region?.getAttribute('aria-live')).toBe('polite');
  });

  it('keeps Save as Draft optional: hidden without a handler, wired with one', async () => {
    await render({});
    expect(
      buttons().some((item) =>
        item.textContent?.includes(en['planner.saveAsDraft']),
      ),
    ).toBe(false);

    await render({ onSaveDraft });
    const save = buttonByLabel(en['planner.saveAsDraft']);
    expect(save.disabled).toBe(false);
    await act(async () => save.click());
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    await render({ onSaveDraft, saving: true });
    expect(buttonByLabel(en['planner.saveAsDraft']).disabled).toBe(true);

    await render({ onSaveDraft, publishing: true });
    expect(buttonByLabel(en['planner.saveAsDraft']).disabled).toBe(true);
  });

  it('renders a single Ready & Publish action owned by the parent call', async () => {
    await render({});
    const publishButtons = buttons().filter((item) =>
      item.textContent?.includes(en['planner.readyPublish']),
    );
    expect(publishButtons).toHaveLength(1);
    const single = publishButtons[0];
    if (!single) throw new Error('Missing publish button');
    await act(async () => single.click());
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('disables publish while publishing and shows the publishing state', async () => {
    await render({ publishing: true });
    const publishing = buttonContaining(en['planner.publishing']);
    expect(publishing.disabled).toBe(true);
    await act(async () => publishing.click());
    expect(onPublish).not.toHaveBeenCalled();
    expect(
      buttons().filter((item) =>
        item.textContent?.includes(en['planner.readyPublish']),
      ),
    ).toHaveLength(0);
  });

  it('disables publish while saving or on conflict', async () => {
    await render({ saving: true });
    expect(buttonByLabel(en['planner.readyPublish']).disabled).toBe(true);

    await render({ saveError: 'conflict' });
    expect(buttonByLabel(en['planner.readyPublish']).disabled).toBe(true);
  });

  it('preserves parent readiness across a no-op autosave cycle', async () => {
    await render({ saving: true, canPublish: true });
    expect(buttonByLabel(en['planner.readyPublish']).disabled).toBe(true);

    // Autosave resolves with no new version: readiness stays parent-owned.
    await render({ saving: false, lastSaved: 'all', canPublish: true });
    expect(statusText()).toBe(en['planner.allSaved']);
    expect(buttonByLabel(en['planner.readyPublish']).disabled).toBe(false);
  });

  it('displays the conflict with a reload action and blocks publish', async () => {
    await render({ saveError: 'conflict' });
    expect(host.textContent).toContain(en['forms.conflictTitle']);
    expect(host.textContent).toContain(en['forms.conflictBody']);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();

    const reload = buttonByLabel(en['forms.reloadDraft']);
    await act(async () => reload.click());
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('matches the PO-approved EN and AR copy byte-exact', () => {
    expect(en['forms.saving']).toBe('Saving draft…');
    expect(en['forms.unsaved']).toBe('Unsaved changes.');
    expect(en['forms.draftSaved']).toBe('Draft saved.');
    expect(en['forms.saveFailed']).toBe('Draft could not be saved. Try again.');
    expect(en['forms.conflictTitle']).toBe('This draft changed elsewhere');
    expect(en['forms.conflictBody']).toBe(
      'Reload the latest draft before continuing.',
    );
    expect(en['forms.reloadDraft']).toBe('Reload latest draft');
    expect(en['planner.allSaved']).toBe('All changes saved');
    expect(en['planner.saveAsDraft']).toBe('Save as Draft');
    expect(en['planner.readyPublish']).toBe('Ready & Publish');
    expect(en['planner.publishing']).toBe('Publishing…');

    expect(ar['forms.saving']).toBe('جارٍ حفظ المسودة…');
    expect(ar['forms.unsaved']).toBe('هناك تغييرات غير محفوظة.');
    expect(ar['forms.draftSaved']).toBe('تم حفظ المسودة.');
    expect(ar['forms.saveFailed']).toBe('تعذر حفظ المسودة. حاول مرة أخرى.');
    expect(ar['forms.conflictTitle']).toBe('تم تعديل هذه المسودة في مكان آخر');
    expect(ar['forms.conflictBody']).toBe('أعد تحميل أحدث مسودة قبل المتابعة.');
    expect(ar['forms.reloadDraft']).toBe('إعادة تحميل أحدث مسودة');
    expect(ar['planner.allSaved']).toBe('كل التعديلات اتحفظت');
    expect(ar['planner.saveAsDraft']).toBe('احفظ كمسودة');
    expect(ar['planner.readyPublish']).toBe('جاهز وانشر');
    expect(ar['planner.publishing']).toBe('جاري النشر…');
  });
});

/** @vitest-environment happy-dom */
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MonthlyQualityView,
  type MonthlyQualityViewProps,
} from '../../components/workforce/MonthlyQualityView';
import { ToastProvider } from '../../components/ui/Toast';
import { en } from '../../lib/i18n/messages/en';
import type {
  MonthlyQualityRevision,
  RecordQualityResult,
} from '../../lib/workforce/quality-server';

const workspaceId = '11111111-1111-1111-1111-111111111111';
const trainerId = '22222222-2222-2222-2222-222222222222';
const otherTrainerId = '77777777-7777-7777-7777-777777777777';
const row: MonthlyQualityRevision = {
  id: '33333333-3333-3333-3333-333333333333',
  workspace_id: workspaceId,
  trainer_id: trainerId,
  month: '2026-11',
  category: 'feedback',
  revision: 2,
  positive_count: 4,
  negative_count: 1,
  positive_weight: '1.00',
  negative_weight: '-1.00',
  net_points: '3.00',
  idempotency_key: '44444444-4444-4444-4444-444444444444',
  created_at: '2026-11-28T00:00:00Z',
  created_by: '55555555-5555-5555-5555-555555555555',
};

const transformation = {
  ...row,
  id: '66666666-6666-6666-6666-666666666666',
  category: 'transformation' as const,
  revision: 1,
  negative_count: 0,
  negative_weight: '0.00',
  net_points: '4.00',
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function renderView(overrides: Partial<MonthlyQualityViewProps> = {}) {
  const props: MonthlyQualityViewProps = {
    locale: 'en',
    messages: en,
    workspaces: [{ id: workspaceId, name: 'Workspace A' }],
    trainers: [
      {
        staff_user_id: trainerId,
        role: 'trainer',
        display_name: 'Trainer A',
        points: '0.00',
        is_negative: false,
      },
      {
        staff_user_id: otherTrainerId,
        role: 'trainer',
        display_name: 'Trainer B',
        points: '0.00',
        is_negative: false,
      },
    ],
    workspaceId,
    trainerId,
    month: '2026-11',
    effective: [row, transformation],
    revisions: [row, transformation],
    isClosed: false,
    status: 'ok',
    initialCategory: 'feedback',
    onSave: vi.fn().mockResolvedValue({ status: 'ok', data: row }),
    ...overrides,
  };
  await act(async () => {
    root.render(
      createElement(
        ToastProvider as unknown as (p: {
          dismissLabel: string;
          children?: unknown;
        }) => ReactElement,
        { dismissLabel: en['toast.dismiss'] },
        createElement(MonthlyQualityView, props),
      ),
    );
  });
  return props;
}

async function change(selector: string, value: string) {
  const element = host.querySelector<HTMLInputElement | HTMLSelectElement>(
    selector,
  );
  if (!element) throw new Error(`Missing ${selector}`);
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function blur(selector: string) {
  const element = host.querySelector<HTMLInputElement>(selector);
  await act(async () => {
    element?.focus();
    element?.blur();
  });
}

async function submit() {
  await act(async () => {
    host
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

async function click(selector: string) {
  await act(async () => {
    host.querySelector<HTMLButtonElement>(selector)?.click();
  });
}

describe('Monthly quality interaction states', () => {
  it('validates weights on blur, corrects live, and submits canonical decimals', async () => {
    const props = await renderView();
    await change('#quality-positive-weight', '1.234');
    await blur('#quality-positive-weight');
    expect(host.textContent).toContain(
      en['workforce.quality.weight.decimalError'],
    );
    expect(
      host
        .querySelector('#quality-positive-weight')
        ?.getAttribute('aria-invalid'),
    ).toBe('true');
    await submit();
    expect(host.querySelector('[data-testid="quality-retry"]')).toBeNull();

    await change('#quality-positive-weight', '1.23');
    expect(host.textContent).not.toContain(
      en['workforce.quality.weight.decimalError'],
    );
    await submit();
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'feedback',
        positiveWeight: '1.23',
        negativeWeight: '-1.00',
        expectedRevision: 2,
      }),
    );
    expect(
      host.querySelector('[data-testid="toast-region"]')?.textContent,
    ).toContain(en['workforce.quality.saved']);
  });

  it('confirms a nonzero-to-zero replacement before writing', async () => {
    const props = await renderView();
    await change('#quality-positive-count', '0');
    await submit();
    expect(props.onSave).not.toHaveBeenCalled();
    const dialog = host.querySelector('dialog[open]');
    expect(dialog?.textContent).toContain(
      en['workforce.quality.zeroConfirmTitle'],
    );
    expect(dialog?.textContent).toContain(
      en['workforce.quality.zeroConfirmBody'],
    );
    await click('dialog[open] [data-testid="dialog-confirm"]');
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ positiveCount: 0, negativeCount: 1 }),
    );
  });

  it('reuses an idempotency key after a lost response and rotates after success', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValueOnce({
        status: 'ok',
        data: { ...row, revision: 3, positive_count: 5 },
      })
      .mockResolvedValueOnce({
        status: 'ok',
        data: { ...row, revision: 4, positive_count: 5 },
      });
    await renderView({ onSave });
    await change('#quality-positive-count', '5');
    await submit();
    expect(host.textContent).toContain(en['workforce.quality.saveError']);
    await submit();
    const first = onSave.mock.calls[0]?.[0];
    const retry = onSave.mock.calls[1]?.[0];
    expect(retry).toEqual(first);
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    await submit();
    const next = onSave.mock.calls[2]?.[0];
    expect(next.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(next.expectedRevision).toBe(3);
  });

  it('blocks another save after a stale revision and offers reload', async () => {
    const onSave = vi.fn().mockResolvedValue({ status: 'stale' });
    await renderView({ onSave });
    await change('#quality-positive-count', '5');
    await submit();
    expect(host.textContent).toContain(en['workforce.quality.stale']);
    expect(
      host.querySelector<HTMLButtonElement>('[data-testid="quality-save"]')
        ?.disabled,
    ).toBe(true);
    expect(host.querySelector('[data-testid="quality-retry"]')).toBeTruthy();
  });

  it('disables every editing and scope control while a save is pending', async () => {
    let resolveSave!: (value: RecordQualityResult) => void;
    const onSave = vi.fn(
      () =>
        new Promise<RecordQualityResult>((resolve) => (resolveSave = resolve)),
    );
    await renderView({ onSave });
    await change('#quality-positive-count', '5');
    await submit();
    for (const selector of [
      '[data-testid="quality-workspace"]',
      '[data-testid="quality-month"]',
      '[data-testid="quality-trainer"]',
      '[data-testid="quality-category"]',
      '#quality-positive-count',
      '#quality-negative-count',
      '#quality-positive-weight',
      '#quality-negative-weight',
      '[data-testid="quality-save"]',
    ]) {
      expect(
        host.querySelector<
          HTMLInputElement | HTMLSelectElement | HTMLButtonElement
        >(selector)?.disabled,
      ).toBe(true);
    }
    await act(async () => {
      resolveSave({
        status: 'ok',
        data: { ...row, revision: 3, positive_count: 5 },
      });
    });
    expect(
      host.querySelector<HTMLInputElement>('#quality-positive-count')?.disabled,
    ).toBe(false);
    expect(
      host.querySelector<HTMLInputElement>('#quality-positive-count')?.value,
    ).toBe('5');
  });

  it('never advances the CAS revision beneath existing field values', async () => {
    const onSave = vi.fn();
    await renderView({ onSave });
    await change('#quality-positive-count', '5');
    await renderView({
      onSave,
      effective: [{ ...row, revision: 3, positive_count: 9 }],
    });
    expect(
      host.querySelector('[data-testid="quality-stale"]')?.textContent,
    ).toContain(en['workforce.quality.stale']);
    expect(
      host.querySelector<HTMLInputElement>('#quality-positive-count')?.value,
    ).toBe('5');
    expect(
      host.querySelector<HTMLButtonElement>('[data-testid="quality-save"]')
        ?.disabled,
    ).toBe(true);
    await submit();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('clears Trainer selection when changing workspace', async () => {
    const onScopeChange = vi.fn();
    const otherWorkspace = '88888888-8888-8888-8888-888888888888';
    await renderView({
      onScopeChange,
      workspaces: [
        { id: workspaceId, name: 'Workspace A' },
        { id: otherWorkspace, name: 'Workspace B' },
      ],
    });
    await change('[data-testid="quality-workspace"]', otherWorkspace);
    expect(onScopeChange).toHaveBeenCalledWith({
      workspaceId: otherWorkspace,
      trainerId: '',
      month: '2026-11',
    });
  });

  it('does not mark a category inspection dirty when values are unchanged', async () => {
    const onScopeChange = vi.fn();
    await renderView({ onScopeChange });
    await change('[data-testid="quality-category"]', 'transformation');
    await change('[data-testid="quality-trainer"]', otherTrainerId);
    expect(host.querySelector('dialog[open]')).toBeNull();
    expect(onScopeChange).toHaveBeenCalledWith({
      workspaceId,
      trainerId: otherTrainerId,
      month: '2026-11',
    });
  });

  it('commits a complete month on blur and never navigates for partial input', async () => {
    const onScopeChange = vi.fn();
    await renderView({ onScopeChange });
    await change('[data-testid="quality-month"]', '2');
    expect(onScopeChange).not.toHaveBeenCalled();
    expect(host.querySelector('dialog[open]')).toBeNull();
    await change('[data-testid="quality-month"]', '2026-10');
    expect(onScopeChange).not.toHaveBeenCalled();
    await blur('[data-testid="quality-month"]');
    expect(onScopeChange).toHaveBeenCalledWith({
      workspaceId,
      trainerId,
      month: '2026-10',
    });
  });

  it('asks before discarding edits for a complete month and restores it on Stay', async () => {
    const onScopeChange = vi.fn();
    await renderView({ onScopeChange });
    await change('#quality-positive-count', '5');
    await change('[data-testid="quality-month"]', '2');
    expect(host.querySelector('dialog[open]')).toBeNull();
    await change('[data-testid="quality-month"]', '2026-10');
    await blur('[data-testid="quality-month"]');
    expect(host.querySelector('dialog[open]')).not.toBeNull();
    await click('dialog[open] [data-testid="dialog-cancel"]');
    expect(onScopeChange).not.toHaveBeenCalled();
    expect(
      host.querySelector<HTMLInputElement>('[data-testid="quality-month"]')
        ?.value,
    ).toBe('2026-11');
  });

  it('keeps dirty category edits until Stay or Discard is chosen', async () => {
    const onScopeChange = vi.fn();
    await renderView({ onScopeChange });
    await change('#quality-positive-count', '5');
    await change('[data-testid="quality-category"]', 'transformation');
    expect(host.querySelector('dialog[open]')?.textContent).toContain(
      en['clientNotes.exitWarning.title'],
    );
    expect(
      host.querySelector<HTMLSelectElement>('[data-testid="quality-category"]')
        ?.value,
    ).toBe('feedback');
    expect(
      host.querySelector<HTMLInputElement>('#quality-positive-count')?.value,
    ).toBe('5');
    await click('dialog[open] [data-testid="dialog-cancel"]');
    expect(
      host.querySelector<HTMLInputElement>('#quality-positive-count')?.value,
    ).toBe('5');

    await change('[data-testid="quality-category"]', 'transformation');
    await click('dialog[open] [data-testid="dialog-confirm"]');
    expect(
      host.querySelector<HTMLSelectElement>('[data-testid="quality-category"]')
        ?.value,
    ).toBe('transformation');
    expect(
      host.querySelector<HTMLInputElement>('#quality-positive-count')?.value,
    ).toBe('4');
    await change('[data-testid="quality-trainer"]', otherTrainerId);
    expect(host.querySelector('dialog[open]')).toBeNull();
    expect(onScopeChange).toHaveBeenCalled();
  });

  it('protects dirty scope changes with Stay/Discard and restores focus semantics', async () => {
    const onScopeChange = vi.fn();
    await renderView({ onScopeChange });
    await change('#quality-positive-count', '5');
    await change('[data-testid="quality-trainer"]', otherTrainerId);
    expect(host.querySelector('dialog[open]')?.textContent).toContain(
      en['clientNotes.exitWarning.title'],
    );
    await click('dialog[open] [data-testid="dialog-cancel"]');
    expect(onScopeChange).not.toHaveBeenCalled();

    await change('[data-testid="quality-trainer"]', otherTrainerId);
    await click('dialog[open] [data-testid="dialog-confirm"]');
    expect(onScopeChange).toHaveBeenCalledWith({
      workspaceId,
      trainerId: otherTrainerId,
      month: '2026-11',
    });
  });
});

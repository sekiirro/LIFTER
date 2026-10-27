import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
const hooks = vi.hoisted(() => ({
  ctx: null as null | {
    index: number;
    states: unknown[];
    refs: { current: unknown }[];
    effects: {
      fn: () => void | (() => void);
      deps?: unknown[];
      ran: boolean;
      cleanup?: void | (() => void);
    }[];
  },
}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const depsEqual = (a?: unknown[], b?: unknown[]) =>
    !!a &&
    !!b &&
    a.length === b.length &&
    a.every((value, index) => Object.is(value, b[index]));
  return {
    ...actual,
    useState(initial: unknown) {
      const ctx = hooks.ctx;
      if (!ctx) throw new Error('missing hook context');
      const index = ctx.index++;
      if (!(index in ctx.states))
        ctx.states[index] =
          typeof initial === 'function'
            ? (initial as () => unknown)()
            : initial;
      return [
        ctx.states[index],
        (next: unknown) => {
          ctx.states[index] =
            typeof next === 'function'
              ? (next as (previous: unknown) => unknown)(ctx.states[index])
              : next;
        },
      ];
    },
    useRef(initial: unknown) {
      const ctx = hooks.ctx;
      if (!ctx) throw new Error('missing hook context');
      const index = ctx.index++;
      if (!(index in ctx.refs)) ctx.refs[index] = { current: initial };
      return ctx.refs[index];
    },
    useEffect(fn: () => void | (() => void), deps?: unknown[]) {
      const ctx = hooks.ctx;
      if (!ctx) throw new Error('missing hook context');
      const index = ctx.index++;
      if (!(index in ctx.effects))
        ctx.effects[index] = { fn, deps, ran: false };
      else if (!depsEqual(ctx.effects[index]!.deps, deps)) {
        ctx.effects[index]!.cleanup?.();
        ctx.effects[index] = { fn, deps, ran: false };
      }
    },
  };
});
const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: nav.refresh, push: nav.push }),
}));
const actions = vi.hoisted(() => ({ issue: vi.fn() }));
vi.mock('../../app/(app)/registration-links/actions', () => ({
  issueRegistrationLinkAction: actions.issue,
}));
import { RegistrationLinkDialog } from '../../components/registration-links/RegistrationLinkDialog';
import { RegistrationLinksManager } from '../../components/registration-links/RegistrationLinksManager';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { getMessages } from '../../lib/i18n';
import type { RegistrationData } from '../../lib/registration-links/read';
const m = getMessages('en');
const ws = '00000000-0000-0000-0000-000000000001';
const version = '00000000-0000-0000-0000-000000000002';
const link = 'https://example.test/register/' + 'A'.repeat(43);
const nextLink = 'https://example.test/register/' + 'B'.repeat(43);
type Context = NonNullable<typeof hooks.ctx>;
type Element = { type: unknown; props: Record<string, unknown> };
const props = {
  workspaceId: ws,
  versionId: version,
  priceMinor: '1200',
  canSchedule: true,
  locale: 'en' as const,
  onClose: vi.fn(),
};
function createContext(): Context {
  return { index: 0, states: [], refs: [], effects: [] };
}
function render(
  input: typeof props,
  ctx: Context = createContext(),
): { tree: ReactElement; ctx: Context } {
  hooks.ctx = ctx;
  ctx.index = 0;
  const tree = RegistrationLinkDialog(input) as ReactElement;
  for (const effect of ctx.effects)
    if (effect && !effect.ran) {
      effect.ran = true;
      effect.cleanup = effect.fn();
    }
  hooks.ctx = null;
  return { tree, ctx };
}
function rerender(ctx: Context, input: typeof props) {
  return render(input, ctx).tree;
}
function unmount(ctx: Context) {
  for (const effect of ctx.effects) {
    if (!effect) continue;
    effect.cleanup?.();
    effect.cleanup = undefined;
  }
}
function collect(node: ReactNode, found: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, found);
    return found;
  }
  if (!isValidElement(node)) return found;
  const element = node as ReactElement<Record<string, unknown>>;
  found.push({ type: element.type, props: element.props });
  collect(element.props.children as ReactNode, found);
  return found;
}
function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (!isValidElement(node)) return '';
  return text(
    (node as ReactElement<Record<string, unknown>>).props.children as ReactNode,
  );
}
function elements(tree: ReactElement) {
  const all = collect(tree);
  return {
    all,
    confirm: all.find((e) => e.type === ConfirmDialog),
    fields: all.filter((e) => e.type === Field),
    buttons: all.filter((e) => e.type === Button),
    alerts: all.filter((e) => e.type === Alert),
    selects: all.filter((e) => e.type === 'select'),
  };
}
function fieldValue(tree: ReactElement, label: string) {
  const field = elements(tree).fields.find((f) =>
    String(f.props.label).startsWith(label),
  );
  return (field?.props.inputProps as { value?: string } | undefined)?.value;
}
function setField(ctx: Context, label: string, index: number, value: string) {
  const fields = elements(rerender(ctx, props)).fields.filter((f) =>
    String(f.props.label).startsWith(label),
  );
  const input = fields[index]!.props.inputProps as {
    onChange: (event: { target: { value: string } }) => void;
  };
  input.onChange({ target: { value } });
  return rerender(ctx, props);
}
function clickButton(tree: ReactElement, label: string) {
  const button = elements(tree).buttons.find((b) =>
    text(b.props.children as ReactNode).includes(label),
  );
  if (!button) throw new Error(`missing button ${label}`);
  (button.props.onClick as () => void)();
}
async function confirm(tree: ReactElement) {
  const dialog = elements(tree).confirm;
  if (!dialog) throw new Error('missing dialog');
  await (dialog.props.onConfirm as () => Promise<void> | void)();
}
function close(tree: ReactElement) {
  const dialog = elements(tree).confirm;
  if (!dialog) throw new Error('missing dialog');
  (dialog.props.onCancel as () => void)();
}
let clipboard: { writeText: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.resetAllMocks();
  clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  vi.stubGlobal('navigator', { clipboard });
  actions.issue.mockResolvedValue({
    status: 'ok',
    linkId: version,
    link,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it.each([false, true])(
  'schedule editor is capability-only %s with no default rows or secret',
  (canSchedule) => {
    const { tree } = render({ ...props, canSchedule });
    const ui = elements(tree);
    expect(
      ui.buttons.some((b) =>
        text(b.props.children as ReactNode).includes(m['registration.add']),
      ),
    ).toBe(canSchedule);
    expect(ui.fields).toHaveLength(0);
    expect(fieldValue(tree, m['registration.url'])).toBeUndefined();
    expect(text(tree)).not.toContain('commission');
    expect(ui.alerts).toHaveLength(0);
  },
);
it('validates the exact live sum, sequence and increasing offsets before issue', async () => {
  const rendered = render(props);
  const ctx = rendered.ctx;
  let tree = rendered.tree;
  expect(elements(tree).alerts).toHaveLength(0);
  clickButton(tree, m['registration.add']);
  tree = rerender(ctx, props);
  expect(
    elements(tree).alerts.some(
      (a) => a.props.title === m['registration.invalid_input'],
    ),
  ).toBe(true);
  tree = setField(ctx, m['registration.amount'], 0, '400');
  tree = setField(ctx, m['registration.offset'], 0, '0');
  expect(text(tree)).toContain('400 / 1200');
  expect(
    elements(tree).alerts.some(
      (a) => a.props.title === m['registration.invalid_input'],
    ),
  ).toBe(true);
  clickButton(tree, m['registration.add']);
  tree = rerender(ctx, props);
  tree = setField(ctx, m['registration.amount'], 1, '800');
  tree = setField(ctx, m['registration.offset'], 1, '12');
  expect(text(tree)).toContain('1200 / 1200');
  expect(elements(tree).alerts).toHaveLength(0);
  tree = setField(ctx, m['registration.offset'], 1, '0');
  expect(
    elements(tree).alerts.some(
      (a) => a.props.title === m['registration.invalid_input'],
    ),
  ).toBe(true);
  tree = setField(ctx, m['registration.offset'], 1, '12');
  tree = setField(ctx, m['registration.amount'], 1, '800.5');
  expect(
    elements(tree).alerts.some(
      (a) => a.props.title === m['registration.invalid_input'],
    ),
  ).toBe(true);
  tree = setField(ctx, m['registration.amount'], 1, '9223372036854775808');
  expect(
    elements(tree).alerts.some(
      (a) => a.props.title === m['registration.invalid_input'],
    ),
  ).toBe(true);
  tree = setField(ctx, m['registration.amount'], 1, '799');
  expect(
    elements(tree).alerts.some(
      (a) => a.props.title === m['registration.invalid_input'],
    ),
  ).toBe(true);
  await confirm(tree);
  expect(actions.issue).not.toHaveBeenCalled();
  tree = setField(ctx, m['registration.amount'], 1, '800');
  tree = setField(ctx, m['registration.offset'], 0, '2');
  expect(elements(tree).alerts).toHaveLength(0);
  await confirm(tree);
  expect(actions.issue).toHaveBeenCalledExactlyOnceWith({
    workspaceId: ws,
    packageVersionId: version,
    installments: [
      { seq: 1, amountMinor: '400', dueOffsetDays: 2 },
      { seq: 2, amountMinor: '800', dueOffsetDays: 12 },
    ],
  });
});
it('removes an installment row, clears its sum feedback and issues a null schedule', async () => {
  const rendered = render(props);
  const ctx = rendered.ctx;
  let tree = rendered.tree;
  clickButton(tree, m['registration.add']);
  tree = rerender(ctx, props);
  tree = setField(ctx, m['registration.amount'], 0, '400');
  tree = setField(ctx, m['registration.offset'], 0, '2');
  expect(text(tree)).toContain('400 / 1200');
  clickButton(tree, `${m['registration.remove']} 1`);
  tree = rerender(ctx, props);
  expect(elements(tree).fields).toHaveLength(0);
  expect(text(tree)).not.toContain('400 / 1200');
  await confirm(tree);
  expect(actions.issue).toHaveBeenCalledExactlyOnceWith({
    workspaceId: ws,
    packageVersionId: version,
    installments: null,
  });
});
it('confirms null schedule and cancel without issuing', async () => {
  let { tree, ctx } = render(props);
  close(tree);
  expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(actions.issue).not.toHaveBeenCalled();
  ({ tree, ctx } = render(props));
  await confirm(tree);
  expect(actions.issue).toHaveBeenCalledExactlyOnceWith({
    workspaceId: ws,
    packageVersionId: version,
    installments: null,
  });
  tree = rerender(ctx, props);
  expect(fieldValue(tree, m['registration.url'])).toBe(link);
  expect(nav.refresh).toHaveBeenCalledTimes(1);
});
it('shows only the copy-only URL and clears it on close', async () => {
  const { tree, ctx } = render(props);
  await confirm(tree);
  let current = rerender(ctx, props);
  expect(fieldValue(current, m['registration.url'])).toBe(link);
  expect(elements(current).fields).toHaveLength(1);
  expect(elements(current).fields[0]!.props.inputProps).toMatchObject({
    value: link,
    readOnly: true,
    dir: 'ltr',
  });
  await confirm(current);
  current = rerender(ctx, props);
  expect(text(current)).toContain(m['registration.copied']);
  expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith(link);
  close(current);
  current = rerender(ctx, props);
  expect(fieldValue(current, m['registration.url'])).toBeUndefined();
  expect(text(current)).not.toContain(link);
  expect(props.onClose).toHaveBeenCalled();
});
it('keeps manual selection available after a copy failure', async () => {
  clipboard.writeText.mockRejectedValue(new Error('denied'));
  const { tree, ctx } = render(props);
  await confirm(tree);
  let current = rerender(ctx, props);
  await confirm(current);
  current = rerender(ctx, props);
  expect(
    elements(current).alerts.some(
      (a) => a.props.title === m['registration.copyError'],
    ),
  ).toBe(true);
  expect(fieldValue(current, m['registration.url'])).toBe(link);
  const input = elements(current).fields[0]!.props.inputProps as {
    onFocus: (event: { currentTarget: { select: () => void } }) => void;
    readOnly: boolean;
  };
  const select = vi.fn();
  input.onFocus({ currentTarget: { select } });
  expect(select).toHaveBeenCalledTimes(1);
  expect(input.readOnly).toBe(true);
});
it('ignores a late success after close and never refreshes', async () => {
  let resolve!: (value: unknown) => void;
  actions.issue.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { tree, ctx } = render(props);
  const pending = confirm(tree);
  close(tree);
  expect(props.onClose).toHaveBeenCalledTimes(1);
  resolve({ status: 'ok', linkId: version, link });
  await pending;
  const current = rerender(ctx, props);
  expect(fieldValue(current, m['registration.url'])).toBeUndefined();
  expect(text(current)).not.toContain(link);
  expect(nav.refresh).not.toHaveBeenCalled();
});
it('clears the secret on unmount and ignores a late success', async () => {
  let resolve!: (value: unknown) => void;
  actions.issue.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { tree, ctx } = render(props);
  const pending = confirm(tree);
  unmount(ctx);
  resolve({ status: 'ok', linkId: version, link });
  await pending;
  expect(nav.refresh).not.toHaveBeenCalled();
  expect(ctx.states).not.toContain(link);
});
it('ignores a late copy result after close', async () => {
  let resolve!: (value: unknown) => void;
  clipboard.writeText.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { tree, ctx } = render(props);
  await confirm(tree);
  let current = rerender(ctx, props);
  const copy = confirm(current);
  close(current);
  resolve(undefined);
  await copy;
  current = rerender(ctx, props);
  expect(fieldValue(current, m['registration.url'])).toBeUndefined();
  expect(text(current)).not.toContain(m['registration.copied']);
  expect(
    elements(current).alerts.some(
      (a) => a.props.title === m['registration.copyError'],
    ),
  ).toBe(false);
});
it('suppresses duplicate pending submissions', async () => {
  let resolve!: (value: unknown) => void;
  actions.issue.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const first = render(props);
  const pending = confirm(first.tree);
  const loadingTree = rerender(first.ctx, props);
  expect(elements(loadingTree).confirm!.props.loading).toBe(true);
  const second = confirm(loadingTree);
  expect(actions.issue).toHaveBeenCalledTimes(1);
  resolve({ status: 'ok', linkId: version, link });
  await pending;
  await second;
  const current = rerender(first.ctx, props);
  expect(fieldValue(current, m['registration.url'])).toBe(link);
});
it('does not reopen an old URL; a new flow issues a new link', async () => {
  actions.issue
    .mockResolvedValueOnce({ status: 'ok', linkId: version, link })
    .mockResolvedValueOnce({ status: 'ok', linkId: version, link: nextLink });
  const first = render(props);
  await confirm(first.tree);
  let current = rerender(first.ctx, props);
  expect(fieldValue(current, m['registration.url'])).toBe(link);
  close(current);
  unmount(first.ctx);
  const second = render(props);
  current = second.tree;
  expect(fieldValue(current, m['registration.url'])).toBeUndefined();
  expect(text(current)).not.toContain(link);
  await confirm(current);
  current = rerender(second.ctx, props);
  expect(fieldValue(current, m['registration.url'])).toBe(nextLink);
  expect(fieldValue(current, m['registration.url'])).not.toBe(link);
});
it.each([
  'not_permitted',
  'invalid_input',
  'unavailable',
  'stale_terms',
  'unknown_status',
] as const)('renders a generic error state for %s', async (status) => {
  actions.issue.mockResolvedValue({ status });
  const { tree, ctx } = render(props);
  await confirm(tree);
  const current = rerender(ctx, props);
  const expected =
    status === 'unknown_status'
      ? m['registration.unavailable']
      : m[`registration.${status}` as keyof typeof m];
  expect(elements(current).alerts.some((a) => a.props.title === expected)).toBe(
    true,
  );
  expect(fieldValue(current, m['registration.url'])).toBeUndefined();
  expect(nav.refresh).not.toHaveBeenCalled();
  if (status === 'stale_terms') {
    clickButton(current, m['registration.reload']);
    expect(props.onClose).toHaveBeenCalled();
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  }
});
it('maps a thrown action to the generic unavailable state', async () => {
  actions.issue.mockRejectedValue(new Error('private provider detail'));
  const { tree, ctx } = render(props);
  await confirm(tree);
  const current = rerender(ctx, props);
  expect(
    elements(current).alerts.some(
      (a) => a.props.title === m['registration.unavailable'],
    ),
  ).toBe(true);
  expect(fieldValue(current, m['registration.url'])).toBeUndefined();
  expect(text(current)).not.toContain('private provider detail');
});
it('closes an open dialog on workspace and package switches', () => {
  const data = {
    status: 'ok',
    offers: [
      {
        workspace_id: ws,
        id: version,
        offer_id: version,
        version: 1,
        name_ar: 'A',
        name_en: 'A',
        price_minor: '1200',
        currency: 'XTS',
        duration_days: 30,
        duration_months: null,
        published_at: '2026-01-01T00:00:00Z',
        published_by: version,
      },
    ],
    links: [],
    installments: [],
  } as unknown as RegistrationData;
  const managerProps = {
    workspaceId: ws,
    workspaces: [
      { id: ws, name: 'A' },
      { id: version, name: 'B' },
    ],
    data,
    canSchedule: true,
    locale: 'en' as const,
  };
  const ctx = createContext();
  hooks.ctx = ctx;
  ctx.index = 0;
  let tree = RegistrationLinksManager(managerProps) as ReactElement;
  hooks.ctx = null;
  clickButton(tree, m['registration.issue']);
  tree = (() => {
    hooks.ctx = ctx;
    ctx.index = 0;
    const next = RegistrationLinksManager(managerProps) as ReactElement;
    hooks.ctx = null;
    return next;
  })();
  expect(
    elements(tree).all.some((e) => e.type === RegistrationLinkDialog),
  ).toBe(true);
  const workspaceSelect = elements(tree).selects.find(
    (s) => s.props.value === ws,
  )!;
  (workspaceSelect.props.onChange as (event: unknown) => void)({
    target: { value: version },
  });
  hooks.ctx = ctx;
  ctx.index = 0;
  tree = RegistrationLinksManager(managerProps) as ReactElement;
  hooks.ctx = null;
  expect(
    elements(tree).all.some((e) => e.type === RegistrationLinkDialog),
  ).toBe(false);
  expect(nav.push).toHaveBeenCalledExactlyOnceWith(
    `/registration-links?workspace=${version}`,
  );
  expect(nav.refresh).not.toHaveBeenCalled();
});

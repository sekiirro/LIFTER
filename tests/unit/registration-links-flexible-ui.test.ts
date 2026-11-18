import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
// S63 verified payload coherence, full-price, count-change and untouched-null
// behavior. T053 adds approved editor labels and timing coverage before T054 UI.
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
import { Field } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { getMessages } from '../../lib/i18n';
const m = getMessages('en');
const ws = '00000000-0000-0000-0000-000000000001';
const version = '00000000-0000-0000-0000-000000000002';
type Context = NonNullable<typeof hooks.ctx>;
type Element = { type: unknown; props: Record<string, unknown> };
const props = {
  workspaceId: ws,
  versionId: version,
  tierLabel: 'Gold',
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
    buttons: all.filter((e) => e.type === Button),
    fields: all.filter((e) => e.type === Field),
  };
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
function setDefaultSplit(ctx: Context, checked: boolean) {
  const field = elements(rerender(ctx, props)).fields.find(
    (item) => item.props.label === m['registration.defaultSplit'],
  );
  const input = field!.props.inputProps as {
    onChange: (event: { currentTarget: { checked: boolean } }) => void;
  };
  input.onChange({ currentTarget: { checked } });
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
  const { ConfirmDialog } = await import('../../components/ui/ConfirmDialog');
  const dialog = collect(tree).find((e) => e.type === ConfirmDialog);
  if (!dialog) throw new Error('missing dialog');
  await (dialog.props.onConfirm as () => Promise<void> | void)();
}
beforeEach(() => {
  vi.resetAllMocks();
  actions.issue.mockResolvedValue({
    status: 'ok',
    linkId: version,
    link: 'https://example.test/register/' + 'A'.repeat(43),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});
it('issues a paymentTerms payload with upfront/count coherence for entered rows', async () => {
  const rendered = render(props);
  const ctx = rendered.ctx;
  let tree = rendered.tree;
  clickButton(tree, m['registration.add']);
  tree = rerender(ctx, props);
  tree = setField(ctx, m['registration.amount'], 0, '400');
  tree = setField(ctx, m['registration.offset'], 0, '0');
  clickButton(tree, m['registration.add']);
  tree = rerender(ctx, props);
  tree = setField(ctx, m['registration.amount'], 1, '800');
  tree = setField(ctx, m['registration.offset'], 1, '45');
  await confirm(tree);
  expect(actions.issue).toHaveBeenCalledExactlyOnceWith({
    workspaceId: ws,
    packageVersionId: version,
    paymentTerms: {
      upfrontAmountMinor: '400',
      totalPaymentCount: 2,
      installments: [
        { seq: 1, amountMinor: '400', dueOffsetDays: 0 },
        { seq: 2, amountMinor: '800', dueOffsetDays: 45 },
      ],
    },
  });
});
it('full-price upfront yields count 1 with no zero remainder row', async () => {
  const rendered = render(props);
  const ctx = rendered.ctx;
  let tree = setDefaultSplit(ctx, true);
  tree = setField(ctx, m['registration.upfrontAmount'], 0, '1200');
  expect(text(tree)).toContain('1200 / 1200');
  await confirm(tree);
  expect(actions.issue).toHaveBeenCalledExactlyOnceWith({
    workspaceId: ws,
    packageVersionId: version,
    paymentTerms: {
      upfrontAmountMinor: '1200',
      totalPaymentCount: 1,
      installments: [{ seq: 1, amountMinor: '1200', dueOffsetDays: 0 }],
    },
  });
});
it('count changes never silently rewrite entered agreements', async () => {
  const rendered = render(props);
  const ctx = rendered.ctx;
  let tree = rendered.tree;
  clickButton(tree, m['registration.add']);
  tree = rerender(ctx, props);
  tree = setField(ctx, m['registration.amount'], 0, '400');
  tree = setField(ctx, m['registration.offset'], 0, '0');
  clickButton(tree, m['registration.add']);
  tree = rerender(ctx, props);
  tree = setField(ctx, m['registration.amount'], 1, '800');
  tree = setField(ctx, m['registration.offset'], 1, '30');
  clickButton(tree, `${m['registration.remove']} 2`);
  tree = rerender(ctx, props);
  const remaining = elements(tree).fields.map(
    (f) =>
      (f.props.inputProps as { value?: string }).value ??
      (f.props.label as string),
  );
  expect(remaining).toContain('400');
  expect(remaining).toContain('0');
  expect(remaining).not.toContain('800');
  await confirm(tree);
  expect(actions.issue).not.toHaveBeenCalled();
  clickButton(tree, m['registration.add']);
  tree = rerender(ctx, props);
  tree = setField(ctx, m['registration.amount'], 1, '800');
  tree = setField(ctx, m['registration.offset'], 1, '30');
  await confirm(tree);
  expect(actions.issue).toHaveBeenCalledExactlyOnceWith({
    workspaceId: ws,
    packageVersionId: version,
    paymentTerms: {
      upfrontAmountMinor: '400',
      totalPaymentCount: 2,
      installments: [
        { seq: 1, amountMinor: '400', dueOffsetDays: 0 },
        { seq: 2, amountMinor: '800', dueOffsetDays: 30 },
      ],
    },
  });
});
it('untouched schedule UI issues legacy null with no invented upfront', async () => {
  const { tree } = render(props);
  await confirm(tree);
  expect(actions.issue).toHaveBeenCalledExactlyOnceWith({
    workspaceId: ws,
    packageVersionId: version,
    installments: null,
  });
});

it('derives the exact residual and 30-day activation offset from an explicit upfront amount', async () => {
  const rendered = render(props);
  let tree = setDefaultSplit(rendered.ctx, true);
  tree = setField(rendered.ctx, m['registration.upfrontAmount'], 0, '400');
  await confirm(tree);
  expect(actions.issue).toHaveBeenCalledExactlyOnceWith({
    workspaceId: ws,
    packageVersionId: version,
    paymentTerms: {
      upfrontAmountMinor: '400',
      totalPaymentCount: 2,
      installments: [
        { seq: 1, amountMinor: '400', dueOffsetDays: 0 },
        { seq: 2, amountMinor: '800', dueOffsetDays: 30 },
      ],
    },
  });
});

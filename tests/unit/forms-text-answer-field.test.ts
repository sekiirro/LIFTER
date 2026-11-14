import { expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useId: () => 'generated-answer-id' };
});

import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { TextAnswerField } from '../../components/forms/TextAnswerField';
import { getMessages } from '../../lib/i18n';

type Element = { type: unknown; props: Record<string, unknown> };

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

it('renders a labelled short field and describes the live counter', () => {
  const tree = TextAnswerField({
    kind: 'shortText',
    label: 'Your name',
    value: 'A😀',
    onChange: vi.fn(),
    locale: 'en',
  });
  const all = collect(tree);
  const label = all.find((element) => element.type === 'label');
  const input = all.find((element) => element.type === 'input');
  const counter = all.find(
    (element) => element.props.id === 'generated-answer-id-counter',
  );

  expect(label?.props).toMatchObject({ htmlFor: 'generated-answer-id' });
  expect(input?.props).toMatchObject({
    id: 'generated-answer-id',
    value: 'A😀',
    dir: 'ltr',
    'aria-describedby': 'generated-answer-id-counter',
  });
  expect(text(counter?.props.children as ReactNode)).toBe(
    'Characters: 2 of 150; 148 remaining',
  );
});

it('renders a labelled long textarea with Arabic direction and localized counter', () => {
  const tree = TextAnswerField({
    kind: 'longText',
    label: 'الإجابة',
    value: 'مُدَرِّب',
    onChange: vi.fn(),
    locale: 'ar',
  });
  const all = collect(tree);
  const label = all.find((element) => element.type === 'label');
  const textarea = all.find((element) => element.type === 'textarea');

  expect(label?.props).toMatchObject({ htmlFor: 'generated-answer-id' });
  expect(textarea?.props).toMatchObject({
    id: 'generated-answer-id',
    value: 'مُدَرِّب',
    dir: 'rtl',
    'aria-describedby': 'generated-answer-id-counter',
  });
  expect(getMessages('ar')['forms.counter']).toContain('حرف');
  expect(getMessages('en')['forms.counter']).toContain('remaining');
});

it('announces only the exact limit threshold and exposes an over-limit error', () => {
  const atLimit = collect(
    TextAnswerField({
      kind: 'shortText',
      label: 'Answer',
      value: 'x'.repeat(150),
      onChange: vi.fn(),
      locale: 'en',
    }),
  );
  const threshold = atLimit.find(
    (element) => element.props.id === 'generated-answer-id-announcement',
  );
  expect(threshold?.props['aria-live']).toBe('polite');

  const overLimit = collect(
    TextAnswerField({
      kind: 'shortText',
      label: 'Answer',
      value: 'x'.repeat(151),
      onChange: vi.fn(),
      locale: 'en',
    }),
  );
  const control = overLimit.find((element) => element.type === 'input');
  const error = overLimit.find(
    (element) => element.props.id === 'generated-answer-id-error',
  );
  expect(control?.props['aria-invalid']).toBe(true);
  expect(control?.props['aria-describedby']).toBe(
    'generated-answer-id-counter generated-answer-id-error',
  );
  expect(error?.props.children).toBe(getMessages('en')['forms.answerTooLong']);
});

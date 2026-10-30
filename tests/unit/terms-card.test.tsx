import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TermsCard, canAcceptTerms } from '../../components/forms/TermsCard';

const policy = {
  version: 'terms-draft-v1',
  isDraft: true,
  draftLabel: 'DRAFT — PO approval required before ship',
  sections: [
    {
      title: 'Account use',
      body: 'Draft policy text for LIFTER, 30 days.',
    },
  ],
};
const labels = {
  title: 'Terms and conditions',
  requiredTerms: 'I accept the terms',
  optionalMarketing: 'I agree to marketing updates',
  accept: 'Continue',
  unavailable: 'This draft cannot be accepted here.',
};

describe('TermsCard', () => {
  it('starts with required terms unchecked and marketing separately optional', () => {
    const html = renderToStaticMarkup(
      createElement(TermsCard, {
        locale: 'en',
        policy,
        labels,
        onAccept: vi.fn(),
      }),
    );

    expect(html).toContain('type="checkbox" required=""');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('name="marketing"');
    expect(html).not.toContain('name="marketing" required=""');
    expect(html).toContain(policy.version);
    expect(html).toContain(policy.draftLabel);
  });

  it('displays each supplied policy section without changing the draft copy', () => {
    const html = renderToStaticMarkup(
      createElement(TermsCard, {
        locale: 'en',
        policy,
        labels,
        onAccept: vi.fn(),
      }),
    );

    expect(html).toContain(policy.sections[0]!.title);
    expect(html).toContain(policy.sections[0]!.body);
    expect(html).toContain(
      '<bdi dir="auto">Draft policy text for LIFTER, 30 days.</bdi>',
    );
  });
});

describe('required terms gate', () => {
  it('allows persistence only after affirmative terms acceptance', () => {
    expect(canAcceptTerms(false)).toBe(false);
    expect(canAcceptTerms(true)).toBe(true);
    expect(canAcceptTerms(true, true, false)).toBe(false);
    expect(canAcceptTerms(true, true, true)).toBe(true);
  });
});

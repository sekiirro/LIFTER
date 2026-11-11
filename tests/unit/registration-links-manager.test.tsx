import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../../lib/i18n', () => ({
  getMessages: () => new Proxy({}, { get: (_target, key) => String(key) }),
}));

import { RegistrationLinksManager } from '../../components/registration-links/RegistrationLinksManager';
import type { RegistrationData } from '../../lib/registration-links/read';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const version = (id: string, offerId: string) => ({
  workspace_id: 'workspace',
  id,
  offer_id: offerId,
  version: 1,
  name_ar: 'same-name',
  name_en: 'same-name',
  price_minor: '1200',
  currency: 'XTS',
  duration_days: 90,
  duration_months: 3,
  published_at: '2026-01-01T00:00:00Z',
  published_by: 'actor',
});

const data = {
  status: 'ok',
  offers: [
    { ...version('silver-version', 'silver-offer'), tier_rank: 1 as const },
    { ...version('gold-version', 'gold-offer'), tier_rank: 2 as const },
  ],
  links: [],
  installments: [],
} satisfies RegistrationData;

describe('registration tier display', () => {
  it.each([
    ['en', 'Silver', 'Gold'],
    ['ar', 'سيلفر', 'جولد'],
  ] as const)(
    'distinguishes same-name offers in %s',
    (locale, first, second) => {
      const html = renderToStaticMarkup(
        createElement(RegistrationLinksManager, {
          workspaceId: 'workspace',
          workspaces: [{ id: 'workspace', name: 'test workspace' }],
          data,
          canSchedule: false,
          locale,
        }),
      );
      expect(html).toContain(`same-name`);
      expect(html).toContain(first);
      expect(html).toContain(second);
      expect(html).toContain('90');
    },
  );
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { getMessages } from '../../lib/i18n';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../../app/(app)/clients/[clientId]/actions', () => ({
  createClientNoteAction: vi.fn(),
  deleteClientNoteAction: vi.fn(),
  loadClientNotesAction: vi.fn(),
  updateClientNoteAction: vi.fn(),
}));

import { ClientDetailsTabs } from '../../app/(app)/clients/[clientId]/ClientDetailsTabs';

describe('staff Client Details Notes route surface', () => {
  it.each([
    ['en', 'ltr'],
    ['ar', 'rtl'],
  ] as const)(
    'renders only the functional Notes tab in %s',
    (locale, direction) => {
      const messages = getMessages(locale);
      const html = renderToStaticMarkup(
        createElement(ClientDetailsTabs, {
          clientId: 'd29e1c04-2ddb-49fd-9a51-161cf35bca89',
          workspaceId: 'a49e1c04-2ddb-49fd-9a51-161cf35bca89',
          actorId: 'staff-user',
          role: 'trainer',
          locale,
          messages,
          notes: [],
          hasMore: false,
          status: 'ready',
        }),
      );

      expect(html).toContain(`dir="${direction}"`);
      expect(html).toContain('role="tablist"');
      expect(html).toContain('role="tab"');
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('role="tabpanel"');
      expect(html).toContain(messages['clientNotes.tab']);
      expect(html).toContain(messages['clientNotes.empty']);
      expect((html.match(/role="tab"/g) ?? []).length).toBe(1);
      const tabMarkup = html.match(
        /<button[^>]*role="tab"[^>]*>(.*?)<\/button>/,
      )?.[1];
      expect(tabMarkup).toBe(messages['clientNotes.tab']);
      expect(html).not.toMatch(/Overview|Exercise|Nutrition|History/i);
    },
  );
});

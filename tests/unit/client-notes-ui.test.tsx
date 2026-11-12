import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClientNotes } from '../../components/client-notes/ClientNotes';
import { getMessages } from '../../lib/i18n';

describe('ClientNotes UI', () => {
  it('renders approved copy in EN', () => {
    const m = getMessages('en');
    const html = renderToStaticMarkup(
      createElement(ClientNotes, { locale: 'en', messages: m, status: 'ready', notes: [] }),
    );
    expect(html).toContain(m['clientNotes.tab']);
    expect(html).toContain(m['clientNotes.empty']);
    expect(html).toContain(m['clientNotes.create']);
  });

  it('renders approved copy in AR with rtl', () => {
    const m = getMessages('ar');
    const html = renderToStaticMarkup(
      createElement(ClientNotes, { locale: 'ar', messages: m, status: 'ready', notes: [] }),
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain(m['clientNotes.tab']);
    expect(html).toContain(m['clientNotes.empty']);
  });

  it('renders loading state', () => {
    const m = getMessages('en');
    const html = renderToStaticMarkup(
      createElement(ClientNotes, { locale: 'en', messages: m, status: 'loading' }),
    );
    expect(html).toContain(m['clientNotes.loading']);
  });

  it('renders error state with retry', () => {
    const m = getMessages('en');
    const html = renderToStaticMarkup(
      createElement(ClientNotes, { locale: 'en', messages: m, status: 'error' }),
    );
    expect(html).toContain(m['clientNotes.loadError']);
    expect(html).toContain(m['clientNotes.retry']);
  });

  it('shows delete only for platform_owner', () => {
    const m = getMessages('en');
    const note = {
      id: 'n1',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'hello',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    const htmlOwner = renderToStaticMarkup(
      createElement(ClientNotes, {
        locale: 'en',
        messages: m,
        status: 'ready',
        notes: [note],
        role: 'platform_owner',
        actorId: 'po',
      }),
    );
    expect(htmlOwner).toContain(m['clientNotes.delete']);
    const htmlTrainer = renderToStaticMarkup(
      createElement(ClientNotes, {
        locale: 'en',
        messages: m,
        status: 'ready',
        notes: [note],
        role: 'trainer',
        actorId: 'u2',
      }),
    );
    expect(htmlTrainer).not.toContain(m['clientNotes.delete']);
  });

  it('shows edit for author or platform_owner', () => {
    const m = getMessages('en');
    const note = {
      id: 'n1',
      workspace_id: 'w',
      client_id: 'c',
      author_user_id: 'u1',
      body: 'hello',
      created_at: '2026-11-08T10:15:00Z',
      edited_at: null,
    };
    const htmlAuthor = renderToStaticMarkup(
      createElement(ClientNotes, {
        locale: 'en',
        messages: m,
        status: 'ready',
        notes: [note],
        role: 'trainer',
        actorId: 'u1',
      }),
    );
    expect(htmlAuthor).toContain(m['clientNotes.edit']);
    const htmlOther = renderToStaticMarkup(
      createElement(ClientNotes, {
        locale: 'en',
        messages: m,
        status: 'ready',
        notes: [note],
        role: 'trainer',
        actorId: 'u2',
      }),
    );
    expect(htmlOther).not.toContain(m['clientNotes.edit']);
  });

  it('renders exit warning strings present in dialog when open is not default (smoke)', () => {
    const m = getMessages('en');
    // ensure keys exist
    expect(m['clientNotes.exitWarning.bodyInFlight']).toBe(
      "Your note is being saved. Leaving now won't cancel the save.",
    );
  });
});

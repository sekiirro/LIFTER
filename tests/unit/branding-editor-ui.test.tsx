import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BrandEditor } from '../../components/branding/BrandEditor';

const projection = {
  workspaceId: '00000000-0000-0000-0000-000000000001',
  name: { ar: 'نادي النخبة', en: 'Elite Club' },
  bannerAlt: { ar: '', en: '' },
  revision: 7,
  color: '#2563EB' as const,
  state: 'draft' as const,
};

describe('branding editor presentation contract', () => {
  it('uses a split editor/live preview on desktop and tab controls for mobile', () => {
    const html = renderToStaticMarkup(
      createElement(BrandEditor, {
        locale: 'en',
        projection,
      }),
    );
    expect(html).toContain('data-editor-layout="split"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('data-preview-surface="registration"');
  });

  it('previews registration, staff dashboard, and the portal placeholder', () => {
    const html = renderToStaticMarkup(
      createElement(BrandEditor, {
        locale: 'ar',
        projection,
      }),
    );
    expect(html).toContain('data-preview-surface="registration"');
    expect(html).toContain('data-preview-surface="staff"');
    expect(html).toContain('data-preview-surface="portal-placeholder"');
    expect(html).toContain('dir="rtl"');
  });

  it('keeps the portal preview static and labels its copy as draft', () => {
    const html = renderToStaticMarkup(
      createElement(BrandEditor, {
        locale: 'en',
        projection,
      }),
    );
    const portal = html.match(
      /<section[^>]*data-preview-surface="portal-placeholder"[^>]*>[\s\S]*?<\/section>/,
    )?.[0];
    expect(portal).toContain('data-portal-preview-notice');
    expect(portal).toContain('DRAFT:');
    expect(portal).not.toMatch(/<(?:button|a|form|input)\b/i);
  });

  it('renders the banner dimensions with one localized unit suffix', () => {
    const html = renderToStaticMarkup(
      createElement(BrandEditor, { locale: 'en', projection }),
    );
    expect(html).toContain('2100 × 1050');
    expect(html).not.toContain('2100 × 1050 px px');
  });

  it('explains source and accessible adjusted colors, keeps draft identity isolated, and omits history controls', () => {
    const html = renderToStaticMarkup(
      createElement(BrandEditor, {
        locale: 'en',
        projection,
        currentPublished: {
          name: { ar: 'النادي المنشور', en: 'Published Club' },
          color: '#059669',
          revision: 5,
        },
      }),
    );
    expect(html).toContain('data-source-color="#2563EB"');
    expect(html).toContain('data-adjusted-color');
    expect(html).toContain('data-adjusted-color-dark');
    expect(html).toContain('data-color-accessibility-explanation');
    expect(html).toContain('Published Club');
    expect(html).not.toContain('restore');
    expect(html).not.toContain('history');
  });

  it('announces a stale revision and discards a late response for a prior workspace', () => {
    const html = renderToStaticMarkup(
      createElement(BrandEditor, {
        locale: 'en',
        projection,
        saveState: 'stale',
        responseWorkspaceId: '00000000-0000-0000-0000-000000000002',
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-discard-stale-workspace-response="true"');
  });
});

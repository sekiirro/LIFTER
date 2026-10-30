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

  it('shows the concise recommended banner guidance in both locales', () => {
    const english = renderToStaticMarkup(
      createElement(BrandEditor, { locale: 'en', projection }),
    );
    const arabic = renderToStaticMarkup(
      createElement(BrandEditor, { locale: 'ar', projection }),
    );
    const englishText = english.replace(/<[^>]+>/g, '');
    const arabicText = arabic.replace(/<[^>]+>/g, '');

    expect(englishText).toContain('Recommended size: 1600 × 800 px (2:1).');
    expect(englishText).toContain(
      'Keep important content away from the edges and the bottom fade.',
    );
    expect(englishText).toContain('Avoid text in the image.');
    expect(english).toContain('1600 × 800 px');
    expect(arabicText).toContain('المقاس الموصى به: 1600 × 800 px (2:1).');
    expect(arabicText).toContain(
      'أبقِ المحتوى المهم بعيدًا عن الحواف والتلاشي السفلي، وتجنّب وضع نص في الصورة.',
    );
    expect(arabic).toContain('1600 × 800 px');
    expect(english).not.toContain('PNG or WebP');
    expect(arabic).not.toContain('PNG أو WebP');

    for (const html of [english, arabic]) {
      const guidance = html.match(
        /<p data-upload-guidance-draft="">([\s\S]*?)<\/p>/,
      )?.[1];
      expect(guidance).toBeDefined();
      expect(
        guidance?.match(/<bdi dir="ltr">1600 × 800 px<\/bdi>/),
      ).toBeTruthy();
      expect(guidance?.match(/<bdi dir="ltr">2:1<\/bdi>/)).toBeTruthy();
    }
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

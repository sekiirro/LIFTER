import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClientPortalBrandPreview } from '../../components/branding/ClientPortalBrandPreview';
import { createPortalBrandContract } from '../../lib/branding/portal-contract';
import { getMessages } from '../../lib/i18n';

describe('nonfunctional Client Portal brand preview', () => {
  it('uses only the published brand contract and exposes no portal actions', () => {
    const html = renderToStaticMarkup(
      createElement(ClientPortalBrandPreview, {
        locale: 'en',
        messages: getMessages('en'),
        contract: createPortalBrandContract({
          workspaceName: 'Published Club',
          color: '#2563EB',
        }),
      }),
    );
    expect(html).toContain('data-client-portal-preview');
    expect(html).toContain('Published Club');
    expect(html).toContain('DRAFT:');
    expect(html).toContain('--brand-fill');
    expect(html).not.toMatch(/<(?:button|a|form|input)\b/i);
  });

  it('keeps the empty publication neutral and localizes the DRAFT notice', () => {
    const html = renderToStaticMarkup(
      createElement(ClientPortalBrandPreview, {
        locale: 'ar',
        messages: getMessages('ar'),
        contract: null,
      }),
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('مسودة:');
    expect(html).not.toContain('Published Club');
    expect(html).not.toMatch(/<(?:button|a|form|input)\b/i);
  });
});

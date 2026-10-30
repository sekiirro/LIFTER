import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HealthDataNotice } from '../../components/forms/HealthDataNotice';
import decisions from '../../specs/015-forms-intake/fixtures/s14-po-decisions.json';

const copy = decisions.P2_health_notice;

describe('HealthDataNotice', () => {
  it('renders the supplied draft notice immediately before the health questions', () => {
    const html = renderToStaticMarkup(
      createElement(
        HealthDataNotice,
        {
          locale: 'ar',
          copy,
          title: 'Health data notice',
          draftLabel: 'DRAFT',
        },
        createElement('h2', null, 'Health question'),
      ),
    );

    expect(html.indexOf(copy.ar)).toBeGreaterThanOrEqual(0);
    expect(html.indexOf(copy.ar)).toBeLessThan(html.indexOf('Health question'));
    expect(html).toContain('aria-labelledby="health-data-notice-title"');
    expect(html).toContain(
      '<h2 id="health-data-notice-title">Health data notice</h2>',
    );
    expect(html).not.toContain('aria-label="DRAFT"');
  });

  it('is informational only and exposes no consent or acknowledgment controls', () => {
    const html = renderToStaticMarkup(
      createElement(HealthDataNotice, {
        locale: 'en',
        copy,
        title: 'Health data notice',
        draftLabel: 'DRAFT — PO approval required',
      }),
    );

    expect(html).toContain(copy.en);
    expect(html).toContain('DRAFT — PO approval required');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('receipt');
  });
});

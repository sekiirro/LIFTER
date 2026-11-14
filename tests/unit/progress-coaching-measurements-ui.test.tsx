import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { MeasurementCorrection } from '../../components/progress-coaching/MeasurementCorrection';
import {
  MeasurementsSection,
  measurementFieldLabel,
} from '../../components/progress-coaching/ProgressView';
import { ToastProvider } from '../../components/ui/Toast';
import { getMessages } from '../../lib/i18n';
import type { ProgressMeasurement } from '../../lib/progress-coaching/types';

const measurement: ProgressMeasurement = {
  id: '30000000-0000-4000-8000-000000000001',
  measurementType: 'bodyWeight',
  value: 92.5,
  unitEn: 'kg',
  unitAr: 'كجم',
  recordedOn: '2026-11-14',
  sourceKind: 'checkin',
  updatedAt: '2026-11-14T10:15:30.123456+02:00',
  label: { en: 'Body weight', ar: 'الوزن' },
};

function staffMarkup(locale: 'en' | 'ar') {
  const messages = getMessages(locale);
  const labels = {
    edit: messages['progress.measurement.edit'],
    confirm: messages['dialog.confirm'],
    cancel: messages['dialog.cancel'],
    saved: messages['toast.success'],
    failed: messages['states.error.description'],
  };
  return renderToStaticMarkup(
    <ToastProvider dismissLabel={messages['toast.dismiss']}>
      <MeasurementsSection
        measurements={[measurement]}
        locale={locale}
        messages={messages}
        rowAction={(m) => (
          <MeasurementCorrection
            workspaceId="10000000-0000-4000-8000-000000000001"
            clientId="20000000-0000-4000-8000-000000000001"
            measurementId={m.id}
            value={m.value}
            updatedAt={m.updatedAt}
            fieldLabel={measurementFieldLabel(m, locale)}
            labels={labels}
            correct={async () => ({ status: 'corrected' })}
          />
        )}
      />
    </ToastProvider>,
  );
}

describe('measurement surfaces (FR-013, FR-016, FR-017)', () => {
  it('labels fields with the authored question text and its unit', () => {
    expect(measurementFieldLabel(measurement, 'en')).toBe('Body weight (kg)');
    expect(measurementFieldLabel(measurement, 'ar')).toBe('الوزن (كجم)');
    expect(measurementFieldLabel({ ...measurement, unitEn: null }, 'en')).toBe(
      'Body weight',
    );
  });

  it.each(['en', 'ar'] as const)(
    'gives staff the approved edit control and no correction history (%s)',
    (locale) => {
      const messages = getMessages(locale);
      const html = staffMarkup(locale);
      expect(html).toContain(`>${messages['progress.measurement.edit']}<`);
      expect(html).toContain('data-testid="progress-measurement-edit"');
      expect(html).toContain(`>${messages['dialog.confirm']}<`);
      expect(html).toContain(`>${messages['dialog.cancel']}<`);
      // The dialog field starts from the current value.
      expect(html).toContain('value="92.5"');
      // FR-013: no history surface; FR-017: no web photo upload.
      expect(html).not.toContain(messages['forms.historyTitle']);
      expect(html).not.toMatch(/type="file"/);
    },
  );

  it('renders the client view read-only', () => {
    const messages = getMessages('en');
    const html = renderToStaticMarkup(
      createElement(MeasurementsSection, {
        measurements: [measurement],
        locale: 'en',
        messages,
      }),
    );
    expect(html).toContain('Body weight');
    expect(html).not.toContain(messages['progress.measurement.edit']);
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<dialog');
  });
});

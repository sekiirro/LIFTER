import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { CheckinConfiguration } from '../../components/progress-coaching/CheckinConfiguration';
import { MeasurementAdd } from '../../components/progress-coaching/MeasurementAdd';
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

  it('renders no controls when none are passed', () => {
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

  it.each(['en', 'ar'] as const)(
    'gives the client the proposed add dialog with value and date (%s)',
    (locale) => {
      const m = getMessages(locale);
      const html = renderToStaticMarkup(
        <ToastProvider dismissLabel={m['toast.dismiss']}>
          <MeasurementAdd
            workspaceId="10000000-0000-4000-8000-000000000001"
            clientId="20000000-0000-4000-8000-000000000001"
            measurementType="bodyWeight"
            typeLabel={locale === 'en' ? 'Body weight' : 'الوزن'}
            unit={locale === 'en' ? 'kg' : 'كجم'}
            today="2026-11-14"
            labels={{
              add: m['progress.measurement.add'],
              value: m['progress.measurement.value'],
              date: m['progress.measurement.date'],
              save: m['progress.measurement.save'],
              cancel: m['dialog.cancel'],
              saved: m['progress.measurement.saved'],
              duplicate: m['progress.measurement.duplicateSameDay'],
              failed: m['states.error.description'],
            }}
            record={async () => ({ status: 'recorded' })}
          />
        </ToastProvider>,
      );
      expect(html).toContain('>' + m['progress.measurement.add'] + '<');
      expect(html).toContain('>' + m['progress.measurement.save'] + '<');
      expect(html).toContain(m['progress.measurement.date']);
      expect(html).toContain('type="date"');
      expect(html).toContain('max="2026-11-14"');
      expect(html).not.toMatch(/type="file"/);
    },
  );

  it('renders the check-in form choice and an empty state', () => {
    const m = getMessages('en');
    const labels = {
      select: m['checkin.config.select'],
      save: m['checkin.config.save'],
      saved: m['checkin.config.saved'],
      invalid: m['checkin.config.invalid'],
      conflict: m['checkin.config.conflict'],
      failed: m['states.error.description'],
      empty: m['states.empty.title'],
    };
    const render = (
      forms: Parameters<typeof CheckinConfiguration>[0]['forms'],
    ) =>
      renderToStaticMarkup(
        <ToastProvider dismissLabel={m['toast.dismiss']}>
          <CheckinConfiguration
            workspaceId="10000000-0000-4000-8000-000000000001"
            locale="en"
            forms={forms}
            currentFormId={null}
            labels={labels}
            configure={async () => ({ status: 'configured' })}
          />
        </ToastProvider>,
      );
    const html = render([
      {
        formId: '40000000-0000-4000-8000-000000000001',
        name: 'Fallback name',
        title: { en: 'Weekly check-in', ar: 'المتابعة الأسبوعية' },
        versionNumber: 1,
        valid: true,
      },
    ]);
    expect(html).toContain('>' + m['checkin.config.select'] + '<');
    expect(html).toContain('>' + m['checkin.config.save'] + '<');
    expect(html).toContain('>Weekly check-in<');
    expect(render([])).toContain(m['states.empty.title']);
  });
});

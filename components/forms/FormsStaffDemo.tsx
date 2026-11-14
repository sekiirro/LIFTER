'use client';

import { useMemo } from 'react';
import type { Locale } from '../../lib/design/preferences';
import {
  createMockFormsStaffAdapter,
  createNeutralFormsBrandSource,
} from '../../lib/forms/mock-staff-adapter';
import { FormsStaffConsole } from './FormsStaffConsole';

export function FormsStaffDemo({
  locale,
  defaultConfigurationError = false,
}: {
  locale: Locale;
  defaultConfigurationError?: boolean;
}) {
  const adapter = useMemo(() => {
    const source = createMockFormsStaffAdapter();
    if (!defaultConfigurationError) return source;
    return {
      ...source,
      async load() {
        const snapshot = await source.load();
        return {
          ...snapshot,
          defaultOnboardingFormId: null,
          defaultConfigurationError: true,
        };
      },
    };
  }, [defaultConfigurationError]);
  const brandSource = useMemo(() => createNeutralFormsBrandSource(), []);
  return (
    <FormsStaffConsole
      locale={locale}
      adapter={adapter}
      brandSource={brandSource}
    />
  );
}

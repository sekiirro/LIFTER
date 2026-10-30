'use client';

import { useMemo } from 'react';
import type { Locale } from '../../lib/design/preferences';
import {
  createMockFormsStaffAdapter,
  createNeutralFormsBrandSource,
} from '../../lib/forms/mock-staff-adapter';
import { FormsStaffConsole } from './FormsStaffConsole';

export function FormsStaffDemo({ locale }: { locale: Locale }) {
  const adapter = useMemo(() => createMockFormsStaffAdapter(), []);
  const brandSource = useMemo(() => createNeutralFormsBrandSource(), []);
  return (
    <FormsStaffConsole
      locale={locale}
      adapter={adapter}
      brandSource={brandSource}
    />
  );
}

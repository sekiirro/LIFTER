'use client';

import { useMemo } from 'react';
import type { Locale } from '../../../lib/design/preferences';
import type { FormsStaffAdapter } from '../../../lib/forms/staff-contracts';
import {
  formsStaffCopy,
  formsStaffLoad,
  formsStaffPublish,
  formsStaffRetire,
  formsStaffSaveDraft,
  formsStaffSelectDefault,
  formsStaffPublishedColor,
} from './actions';
import { FormsStaffConsole } from '../../../components/forms/FormsStaffConsole';

export function ProductionFormsConsole({
  locale,
  role,
  workspaceId,
  workspaces,
}: {
  locale: Locale;
  role: 'po' | 'wo' | 'trainer';
  workspaceId: string;
  workspaces: readonly { id: string; name: string }[];
}) {
  const { adapter, brandSource } = useMemo(() => {
    const adapter: FormsStaffAdapter = {
      load: () => formsStaffLoad(workspaceId),
      saveDraft: (_role, form, requestId) =>
        formsStaffSaveDraft(workspaceId, form, requestId),
      publish: (_role, formId, requestId) =>
        formsStaffPublish(workspaceId, formId, requestId),
      retire: (_role, formId, requestId) =>
        formsStaffRetire(workspaceId, formId, requestId),
      copy: (_role, formId, requestId) =>
        formsStaffCopy(workspaceId, formId, requestId),
      selectDefaultOnboardingForm: (_role, formId) =>
        formsStaffSelectDefault(workspaceId, formId),
    };
    return {
      adapter,
      brandSource: {
        resolvePublishedColor: () => formsStaffPublishedColor(workspaceId),
      },
    };
  }, [workspaceId]);

  return (
    <FormsStaffConsole
      locale={locale}
      adapter={adapter}
      brandSource={brandSource}
      workspaceId={workspaceId}
      workspaces={workspaces}
      actorRole={role}
      demo={false}
    />
  );
}

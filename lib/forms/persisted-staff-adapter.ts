import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FormsStaffAdapter,
  FormsStaffSelectionResult,
  FormsStaffSnapshot,
} from './staff-contracts';

type StaffFormsResponse = {
  status?: string;
  defaultOnboardingFormId?: string | null;
  forms?: FormsStaffSnapshot['forms'];
};

/**
 * Persisted read/selection seam for the existing staff adapter contract.
 * Draft editing/publishing stays behind the later Builder persistence slice.
 */
export function createPersistedFormsStaffAdapter(
  client: SupabaseClient,
  workspaceId: string,
): Pick<FormsStaffAdapter, 'load' | 'selectDefaultOnboardingForm'> {
  return {
    async load(): Promise<FormsStaffSnapshot> {
      const { data, error } = await client.rpc('get_staff_forms', {
        p_workspace_id: workspaceId,
      });
      if (error) throw new Error('Unable to load workspace forms');
      const response = data as StaffFormsResponse | null;
      if (response?.status !== 'ok') {
        throw new Error('Workspace forms are unavailable');
      }
      return {
        forms: response.forms ?? [],
        assignments: [],
        defaultOnboardingFormId: response.defaultOnboardingFormId ?? null,
      };
    },
    async selectDefaultOnboardingForm(
      _role,
      formId,
    ): Promise<FormsStaffSelectionResult> {
      const { data, error } = await client.rpc(
        'select_default_onboarding_form',
        { p_workspace_id: workspaceId, p_form_id: formId },
      );
      if (error) return { status: 'unavailable' };
      const response = data as { status?: string } | null;
      if (response?.status === 'ok') return { status: 'ok' };
      if (response?.status === 'forbidden') return { status: 'forbidden' };
      if (response?.status === 'missing') return { status: 'missing' };
      return { status: 'unavailable' };
    },
  };
}

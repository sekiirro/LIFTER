import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FormsStaffAdapter,
  FormsStaffResult,
  FormsStaffRetireResult,
  FormsStaffSelectionResult,
  FormsStaffSnapshot,
  StaffFormDraft,
} from './staff-contracts';

type StaffFormsResponse = {
  status?: string;
  errorCode?: string;
  defaultOnboardingFormId?: string | null;
  forms?: FormsStaffSnapshot['forms'];
};

type BuilderResponse = {
  status?: string;
  formId?: string;
  revision?: number;
  formStatus?: StaffFormDraft['status'];
  name?: string;
  definition?: {
    title?: StaffFormDraft['title'];
    sections?: StaffFormDraft['sections'];
    questions?: StaffFormDraft['questions'];
    deadlineDays?: number;
  };
};

function requestIdOrNew(requestId?: string): string {
  return requestId ?? globalThis.crypto.randomUUID();
}

function builderResult(data: unknown, error: unknown): FormsStaffResult {
  if (error) return { status: 'invalid' };
  const response = data as BuilderResponse | null;
  if (response?.status === 'ok' && response.formId && response.definition) {
    const definition = response.definition;
    return {
      status: 'ok',
      form: {
        id: response.formId,
        title: definition.title ?? { en: response.name ?? '', ar: '' },
        sections: definition.sections ?? [],
        questions: definition.questions ?? [],
        deadlineDays: definition.deadlineDays ?? 3,
        status: response.formStatus ?? 'draft',
        revision: response.revision ?? 0,
      },
    };
  }
  if (
    response?.status === 'invalid' ||
    response?.status === 'conflict' ||
    response?.status === 'idempotency_conflict' ||
    response?.status === 'forbidden' ||
    response?.status === 'missing' ||
    response?.status === 'default_selected'
  ) {
    return {
      status:
        response.status === 'idempotency_conflict'
          ? 'conflict'
          : response.status,
    };
  }
  if (response === null) return { status: 'forbidden' };
  return { status: 'invalid' };
}

function builderRpcForm(form: StaffFormDraft) {
  return {
    title: form.title,
    sections: form.sections,
    questions: form.questions,
    deadlineDays: form.deadlineDays,
  };
}

/**
 * Persisted Forms adapter; authorization is enforced by the workspace RPCs.
 */
export function createPersistedFormsStaffAdapter(
  client: SupabaseClient,
  workspaceId: string,
): FormsStaffAdapter {
  return {
    async load(): Promise<FormsStaffSnapshot> {
      const { data, error } = await client.rpc('get_staff_forms', {
        p_workspace_id: workspaceId,
      });
      if (error) throw new Error('Unable to load workspace forms');
      const response = data as StaffFormsResponse | null;
      const configurationError =
        response?.status === 'configuration_error' &&
        response.errorCode === 'onboarding_default_configuration';
      if (response?.status !== 'ok' && !configurationError) {
        throw new Error('Workspace forms are unavailable');
      }
      return {
        forms: response.forms ?? [],
        assignments: [],
        defaultOnboardingFormId: response.defaultOnboardingFormId ?? null,
        defaultConfigurationError: configurationError,
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
    async saveDraft(_role, form, requestId): Promise<FormsStaffResult> {
      const { data, error } = await client.rpc('save_workspace_form_draft', {
        p_workspace_id: workspaceId,
        p_form_id: form.id,
        p_expected_revision: form.revision,
        p_definition: builderRpcForm(form),
        p_request_id: requestIdOrNew(requestId),
        p_name: form.title.en,
      });
      return builderResult(data, error);
    },
    async publish(_role, formId, requestId): Promise<FormsStaffResult> {
      const { data, error } = await client.rpc('publish_workspace_form', {
        p_workspace_id: workspaceId,
        p_form_id: formId,
        p_request_id: requestIdOrNew(requestId),
      });
      return builderResult(data, error);
    },
    async retire(_role, formId, requestId): Promise<FormsStaffRetireResult> {
      const { data, error } = await client.rpc('retire_workspace_form', {
        p_workspace_id: workspaceId,
        p_form_id: formId,
        p_request_id: requestIdOrNew(requestId),
      });
      const response = data as BuilderResponse | null;
      if (
        !error &&
        response?.status === 'ok' &&
        response.formId === formId &&
        typeof response.revision === 'number' &&
        response.formStatus === 'retired' &&
        !response.definition
      ) {
        return { status: 'ok' };
      }
      return builderResult(data, error);
    },
    async copy(_role, formId, requestId): Promise<FormsStaffResult> {
      const { data, error } = await client.rpc('copy_workspace_form', {
        p_workspace_id: workspaceId,
        p_source_form_id: formId,
        p_request_id: requestIdOrNew(requestId),
      });
      return builderResult(data, error);
    },
  };
}

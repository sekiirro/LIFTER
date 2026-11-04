import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createPersistedFormsStaffAdapter } from '../../lib/forms/persisted-staff-adapter';

function clientFor(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as SupabaseClient;
}

describe('persisted Forms staff adapter', () => {
  it('loads the generic default-configuration error with forms available for correction', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: 'configuration_error',
        errorCode: 'onboarding_default_configuration',
        defaultOnboardingFormId: null,
        forms: [{ id: 'eligible-1', status: 'published' }],
      },
      error: null,
    });
    const adapter = createPersistedFormsStaffAdapter(
      clientFor(rpc),
      'workspace-1',
    );
    await expect(adapter.load()).resolves.toMatchObject({
      defaultOnboardingFormId: null,
      defaultConfigurationError: true,
      forms: [{ id: 'eligible-1', status: 'published' }],
    });
  });

  it('loads the workspace snapshot through the audited Forms RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: 'ok',
        defaultOnboardingFormId: 'form-1',
        forms: [
          {
            id: 'form-1',
            title: { en: 'Your First Step', ar: '' },
            needsAttention: true,
          },
        ],
      },
      error: null,
    });
    const adapter = createPersistedFormsStaffAdapter(
      clientFor(rpc),
      'workspace-1',
    );
    await expect(adapter.load()).resolves.toMatchObject({
      defaultOnboardingFormId: 'form-1',
      forms: [{ id: 'form-1', needsAttention: true }],
      assignments: [],
    });
    expect(rpc).toHaveBeenCalledWith('get_staff_forms', {
      p_workspace_id: 'workspace-1',
    });
  });

  it('uses the audited selection RPC and preserves its denial outcomes', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { status: 'forbidden' }, error: null })
      .mockResolvedValueOnce({ data: { status: 'missing' }, error: null });
    const adapter = createPersistedFormsStaffAdapter(
      clientFor(rpc),
      'workspace-1',
    );
    await expect(
      adapter.selectDefaultOnboardingForm('wo', 'form-1'),
    ).resolves.toEqual({ status: 'forbidden' });
    await expect(
      adapter.selectDefaultOnboardingForm('wo', 'retired'),
    ).resolves.toEqual({ status: 'missing' });
    expect(rpc).toHaveBeenNthCalledWith(1, 'select_default_onboarding_form', {
      p_workspace_id: 'workspace-1',
      p_form_id: 'form-1',
    });
  });

  it('keeps transport and unavailable outcomes generic', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { status: 'unavailable' }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('raw db error') });
    const adapter = createPersistedFormsStaffAdapter(
      clientFor(rpc),
      'workspace-1',
    );
    await expect(
      adapter.selectDefaultOnboardingForm('wo', 'form-1'),
    ).resolves.toEqual({
      status: 'unavailable',
    });
    await expect(
      adapter.selectDefaultOnboardingForm('wo', 'form-1'),
    ).resolves.toEqual({
      status: 'unavailable',
    });
    await expect(
      adapter.selectDefaultOnboardingForm('wo', 'form-1'),
    ).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('wires Builder save, publish, retire, and copy through idempotent RPCs', async () => {
    const definition = {
      title: { en: 'Your First Step', ar: 'عنوان' },
      sections: [{ id: 'basics', title: { en: 'Basics', ar: 'أساسيات' } }],
      questions: [],
      deadlineDays: 3,
    };
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: 'ok',
        formId: 'form-1',
        revision: 2,
        formStatus: 'draft',
        definition,
      },
      error: null,
    });
    const adapter = createPersistedFormsStaffAdapter(
      clientFor(rpc),
      'workspace-1',
    );
    const form = {
      id: 'form-1',
      ...definition,
      status: 'draft' as const,
      revision: 1,
    };
    await expect(
      adapter.saveDraft('wo', form, 'retry-key'),
    ).resolves.toMatchObject({
      status: 'ok',
      form: { id: 'form-1', revision: 2, status: 'draft' },
    });
    expect(rpc).toHaveBeenNthCalledWith(1, 'save_workspace_form_draft', {
      p_workspace_id: 'workspace-1',
      p_form_id: 'form-1',
      p_expected_revision: 1,
      p_definition: definition,
      p_request_id: 'retry-key',
      p_name: 'Your First Step',
    });
    await adapter.publish('wo', 'form-1', 'publish-key');
    expect(rpc).toHaveBeenNthCalledWith(2, 'publish_workspace_form', {
      p_workspace_id: 'workspace-1',
      p_form_id: 'form-1',
      p_request_id: 'publish-key',
    });
    await adapter.retire('wo', 'form-1', 'retire-key');
    expect(rpc).toHaveBeenNthCalledWith(3, 'retire_workspace_form', {
      p_workspace_id: 'workspace-1',
      p_form_id: 'form-1',
      p_request_id: 'retire-key',
    });
    await adapter.copy('wo', 'form-1', 'copy-key');
    expect(rpc).toHaveBeenNthCalledWith(4, 'copy_workspace_form', {
      p_workspace_id: 'workspace-1',
      p_source_form_id: 'form-1',
      p_request_id: 'copy-key',
    });
  });

  it('keeps the selected-default retirement refusal distinct from success', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { status: 'default_selected' },
      error: null,
    });
    const adapter = createPersistedFormsStaffAdapter(
      clientFor(rpc),
      'workspace-1',
    );
    await expect(adapter.retire('wo', 'form-1')).resolves.toEqual({
      status: 'default_selected',
    });
  });

  it('maps a reused request key with a different payload to conflict', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { status: 'idempotency_conflict' },
      error: null,
    });
    const adapter = createPersistedFormsStaffAdapter(
      clientFor(rpc),
      'workspace-1',
    );
    await expect(
      adapter.publish('wo', 'form-1', 'reused-key'),
    ).resolves.toEqual({ status: 'conflict' });
  });

  it('surfaces a persisted denial as forbidden uniformly for Builder writes', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const adapter = createPersistedFormsStaffAdapter(
      clientFor(rpc),
      'workspace-1',
    );
    await expect(adapter.publish('sales', 'form-1')).resolves.toEqual({
      status: 'forbidden',
    });
    await expect(adapter.retire('sales', 'form-1')).resolves.toEqual({
      status: 'forbidden',
    });
    await expect(adapter.copy('sales', 'form-1')).resolves.toEqual({
      status: 'forbidden',
    });
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});

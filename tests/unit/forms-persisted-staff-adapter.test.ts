import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createPersistedFormsStaffAdapter } from '../../lib/forms/persisted-staff-adapter';

function clientFor(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as SupabaseClient;
}

describe('persisted Forms staff adapter', () => {
  it('loads the workspace snapshot through the audited Forms RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: 'ok',
        defaultOnboardingFormId: 'form-1',
        forms: [{ id: 'form-1', title: { en: 'Your First Step', ar: '' } }],
      },
      error: null,
    });
    const adapter = createPersistedFormsStaffAdapter(
      clientFor(rpc),
      'workspace-1',
    );
    await expect(adapter.load()).resolves.toMatchObject({
      defaultOnboardingFormId: 'form-1',
      forms: [{ id: 'form-1' }],
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
});

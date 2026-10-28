import { expect, it, vi } from 'vitest';
import { authorize } from '../../lib/auth/authorize';
import { CAPABILITIES } from '../../lib/auth/capabilities';

it.each(CAPABILITIES)(
  'pending client cannot %s even when the backend accepts',
  (capability) => {
    const backend = vi.fn(() => true);
    const pendingClient = {
      userId: 'synthetic-pending',
      role: null,
      activeWorkspaceIds: ['synthetic-workspace'],
    };
    const result =
      authorize(pendingClient, capability, 'synthetic-workspace') && backend();
    expect(result).toBe(false);
    expect(backend).not.toHaveBeenCalled();
  },
);

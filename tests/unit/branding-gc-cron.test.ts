import { describe, expect, it, vi } from 'vitest';
import { runBrandingGc } from '../../workers/cron/src/branding-gc';

const claim = {
  id: '00000000-0000-4000-8000-000000000001',
  workspace_id: '00000000-0000-4000-8000-000000000002',
  bucket_id: 'branding-validated',
  object_name: `00000000-0000-4000-8000-000000000002/validated/logo/${'a'.repeat(64)}-00000000-0000-4000-8000-000000000001.png`,
};

describe('branding garbage collection cron', () => {
  it('removes claimed bytes before finalizing, using one bounded batch', async () => {
    const events: string[] = [];
    await runBrandingGc({
      claim: vi.fn(async (batchSize) => {
        expect(batchSize).toBe(10);
        return [claim];
      }),
      remove: vi.fn(async () => {
        events.push('remove');
      }),
      finalize: vi.fn(async () => {
        events.push('finalize');
        return true;
      }),
    });
    expect(events).toEqual(['remove', 'finalize']);
  });

  it('does not finalize after a byte-removal failure so the lease can retry', async () => {
    const finalize = vi.fn(async () => true);
    await expect(
      runBrandingGc({
        claim: async () => [claim],
        remove: async () => {
          throw new Error('storage unavailable');
        },
        finalize,
      }),
    ).rejects.toThrow('branding_gc_pass_failed');
    expect(finalize).not.toHaveBeenCalled();
  });

  it('continues after a claim failure, logs generically, and processes later claims', async () => {
    const laterClaims = [
      {
        ...claim,
        id: '00000000-0000-4000-8000-000000000003',
        object_name: `${claim.workspace_id}/validated/logo/${'a'.repeat(64)}-00000000-0000-4000-8000-000000000003.png`,
      },
      {
        ...claim,
        id: '00000000-0000-4000-8000-000000000004',
        object_name: `${claim.workspace_id}/validated/logo/${'a'.repeat(64)}-00000000-0000-4000-8000-000000000004.png`,
      },
    ];
    const remove = vi.fn(async (_bucket: string, objectName: string) => {
      if (objectName === claim.object_name)
        throw new Error(`secret token at ${objectName}`);
    });
    const finalize = vi.fn(async () => true);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await expect(
        runBrandingGc({
          claim: async () => [claim, ...laterClaims],
          remove,
          finalize,
        }),
      ).rejects.toThrow('branding_gc_pass_failed');
      expect(remove).toHaveBeenCalledTimes(3);
      expect(finalize).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledWith('branding_gc_claim_failed');
      expect(JSON.stringify(log.mock.calls)).not.toContain(claim.object_name);
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret token');
    } finally {
      log.mockRestore();
    }
  });

  it('rejects unexpected bucket and path claims before touching Storage', async () => {
    const remove = vi.fn(async () => {});
    await expect(
      runBrandingGc({
        claim: async () => [{ ...claim, object_name: '../outside' }],
        remove,
        finalize: async () => true,
      }),
    ).rejects.toThrow('branding_gc_pass_failed');
    expect(remove).not.toHaveBeenCalled();
  });

  it('cleans a stale staging upload through the same leased GC path', async () => {
    const events: string[] = [];
    await runBrandingGc({
      claim: async () => [
        {
          ...claim,
          bucket_id: 'branding-staging',
          object_name: `${claim.workspace_id}/staging/00000000-0000-4000-8000-000000000003`,
        },
      ],
      remove: async (bucket, objectName) => {
        expect(bucket).toBe('branding-staging');
        expect(objectName).toBe(
          `${claim.workspace_id}/staging/00000000-0000-4000-8000-000000000003`,
        );
        events.push('remove');
      },
      finalize: async () => {
        events.push('finalize');
        return true;
      },
    });
    expect(events).toEqual(['remove', 'finalize']);
  });
});

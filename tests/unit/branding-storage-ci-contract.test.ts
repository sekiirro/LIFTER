import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseStoragePlaywrightSummary } from '../../scripts/client-accounts-storage-result.mjs';

describe('F14 Storage CI lane contract', () => {
  it('requires the isolated Stack B Storage job, readiness gate, and zero-skip guard', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(workflow).toMatch(/\n  storage:\n/);
    expect(workflow).toContain('LIFTER_SUPABASE_STACK: b');
    expect(workflow).toContain('node scripts/wait-storage-ready.mjs');
    expect(workflow).toContain('scripts/client-accounts-storage-result.mjs');
    expect(workflow).toContain('tests/e2e/client-accounts-storage.spec.ts');
  });

  it('fails closed if the Storage denial is skipped or does not pass exactly once', () => {
    expect(parseStoragePlaywrightSummary('1 skipped').acceptable).toBe(false);
    expect(
      parseStoragePlaywrightSummary('0 passed, 1 skipped').acceptable,
    ).toBe(false);
    expect(parseStoragePlaywrightSummary('1 passed').acceptable).toBe(true);
  });

  it('keeps the required pending-client read and write denials covered by the F11 test', () => {
    const pendingStorageTest = readFileSync(
      'tests/e2e/client-accounts-storage.spec.ts',
      'utf8',
    );
    expect(pendingStorageTest).toContain(
      'a real pending-client JWT cannot read or write Storage',
    );
    expect(pendingStorageTest).toContain('.download(');
    expect(pendingStorageTest).toContain('.upload(');
    expect(pendingStorageTest).toContain(
      'expect(read.error !== null).toBe(true)',
    );
    expect(pendingStorageTest).toContain(
      'expect(write.error !== null).toBe(true)',
    );
  });
});

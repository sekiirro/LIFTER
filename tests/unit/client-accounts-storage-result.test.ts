import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseStoragePlaywrightSummary } from '../../scripts/client-accounts-storage-result.mjs';

it('rejects a Storage run that skipped instead of passing', () => {
  expect(parseStoragePlaywrightSummary('1 skipped')).toEqual({
    passed: 0,
    skipped: 1,
    failed: 0,
    flaky: 0,
    interrupted: 0,
    acceptable: false,
  });
});

it('uses portable Docker path fallbacks only when docker is absent from PATH', () => {
  const script = readFileSync(
    'scripts/test-client-accounts-storage.ps1',
    'utf8',
  );
  expect(script).not.toContain('C:\\Users\\NEW LAP');
  expect(script).toContain('Get-Command docker');
  expect(script).toContain('$env:DOCKER_BIN');
  expect(script).toContain('$env:ProgramFiles');
  expect(script).toContain('$env:LOCALAPPDATA');
  expect(script).toContain('Test-Path');
});

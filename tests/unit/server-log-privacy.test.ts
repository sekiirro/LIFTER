import { expect, it } from 'vitest';
import { scanSensitiveLogLines } from '../e2e/server-log-privacy';

it('detects canary secrets in raw log lines even when a counts summary cannot', () => {
  const canary = {
    token: 'canary-token-value',
    password: 'canary-password-value',
    email: 'canary@example.test',
  };
  const summary = JSON.stringify({ totalLines: 1, stderrLines: 1 });
  expect(
    scanSensitiveLogLines(
      [`request failed ${canary.token} ${canary.password} ${canary.email}`],
      canary,
    ),
  ).toEqual({
    hitCount: 3,
    matchedLineCount: 1,
    categories: ['email', 'password', 'token'],
  });
  expect(scanSensitiveLogLines([summary], canary).hitCount).toBe(0);
});

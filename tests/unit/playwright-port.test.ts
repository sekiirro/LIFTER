import { describe, expect, it } from 'vitest';
import {
  resolvePlaywrightBaseUrl,
  resolvePlaywrightPort,
  shouldReusePlaywrightServer,
} from '../../scripts/playwright-port.mjs';

describe('Playwright local port resolution', () => {
  it('defaults to port 3000 and preserves the default CI URL', () => {
    expect(resolvePlaywrightPort({})).toBe(3000);
    expect(resolvePlaywrightBaseUrl({})).toBe('http://localhost:3000');
    expect(shouldReusePlaywrightServer({})).toBe(true);
    expect(shouldReusePlaywrightServer({ PLAYWRIGHT_PORT: '3000' })).toBe(
      false,
    );
  });

  it('uses an isolated requested port in the config and test origin', () => {
    const env = { PLAYWRIGHT_PORT: '3437' };
    expect(resolvePlaywrightPort(env)).toBe(3437);
    expect(resolvePlaywrightBaseUrl(env)).toBe('http://localhost:3437');
    expect(shouldReusePlaywrightServer(env)).toBe(false);
  });

  it('honors an explicit base URL and rejects invalid ports', () => {
    expect(
      resolvePlaywrightBaseUrl({
        PLAYWRIGHT_PORT: '3437',
        PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:3437',
      }),
    ).toBe('http://127.0.0.1:3437');
    expect(() => resolvePlaywrightPort({ PLAYWRIGHT_PORT: '70000' })).toThrow(
      'PLAYWRIGHT_PORT must be an integer between 1 and 65535',
    );
  });
});

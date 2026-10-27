import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';
import { buildHealth } from '../../lib/health';

describe('buildHealth', () => {
  it('returns exactly the public health fields with the package version', () => {
    const health = buildHealth(packageJson.version);

    expect(Object.keys(health).sort()).toEqual(['status', 'version']);
    expect(health.status).toBe('ok');
    expect(health.version).toBe(packageJson.version);
    expect(health.version).toMatch(
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/,
    );
  });

  it('uses the supplied version without changing it', () => {
    expect(buildHealth('2.3.4-rc.1+build.5')).toEqual({
      status: 'ok',
      version: '2.3.4-rc.1+build.5',
    });
  });
});

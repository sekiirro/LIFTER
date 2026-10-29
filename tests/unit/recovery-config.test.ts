import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('local Supabase recovery configuration', () => {
  it('sets email recovery links to the PO-decided 60-minute expiry', () => {
    const config = readFileSync(
      new URL('../../supabase/config.toml', import.meta.url),
      'utf8',
    );
    const emailAuth = config
      .split(/^\[auth\.email\]\s*$/m)[1]
      ?.split(/^\[/m)[0];

    expect(emailAuth).toMatch(/^otp_expiry\s*=\s*3600\s*$/m);
  });
});

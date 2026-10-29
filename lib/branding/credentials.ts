import 'server-only';

export type BrandingIdentity = 'branding_proxy' | 'branding_validator';

/** Externally issued bearer only. No project signing authority enters Workers. */
export function readBrandingCredential(
  identity: BrandingIdentity,
): string | null {
  const value =
    identity === 'branding_proxy'
      ? process.env.BRANDING_PROXY_JWT
      : process.env.BRANDING_VALIDATOR_JWT;
  return value && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
    ? value
    : null;
}

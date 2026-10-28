type HeadersLike = { get(name: string): string | null };
type Options = {
  mode?: 'production' | 'development' | 'test';
  allowTestOverride?: boolean;
  testIp?: string;
};

/** Full address attribution; only the rate-key input groups IPv6 subnets. */
export function trustedIp(
  headers: HeadersLike,
  options: Options = {},
): string | null {
  const supplied = headers.get('CF-Connecting-IP');
  const raw =
    supplied ??
    ((options.mode === 'test' || options.mode === 'development') &&
    options.allowTestOverride === true
      ? options.testIp
      : undefined);
  if (!raw || raw !== raw.trim()) return null;
  if (/^(0|[1-9][0-9]{0,2})(\.(0|[1-9][0-9]{0,2})){3}$/.test(raw))
    return raw.split('.').every((part) => Number(part) <= 255) ? raw : null;
  if (!raw.includes(':') || !/^[0-9a-fA-F:.]+$/.test(raw)) return null;
  try {
    // WHATWG host serialization supplies RFC 5952 lowercase/compression.
    const normalized = new URL(`http://[${raw}]/`).hostname.slice(1, -1);
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
    if (mapped) {
      const a = parseInt(mapped[1]!, 16),
        b = parseInt(mapped[2]!, 16);
      return [a >>> 8, a & 255, b >>> 8, b & 255].join('.');
    }
    return normalized;
  } catch {
    return null;
  }
}

/** PO decision 2026-10-28: ASCII RFC 5952 /64 network text, no slash.
 * trustedIp first converts mapped IPv4 to dotted-quad; IPv4 stays per address.
 */
export function rateIpInput(canonicalIp: string): string {
  if (!canonicalIp.includes(':')) return canonicalIp;
  const [left, right] = canonicalIp.split('::');
  const head = left ? left.split(':') : [];
  const tail = right ? right.split(':') : [];
  const words =
    right !== undefined
      ? [
          ...head,
          ...Array<string>(8 - head.length - tail.length).fill('0'),
          ...tail,
        ]
      : head;
  const network = [...words.slice(0, 4), '0', '0', '0', '0'].join(':');
  return new URL(`http://[${network}]/`).hostname.slice(1, -1);
}

export function resolvePlaywrightPort(env = process.env) {
  const raw = env.PLAYWRIGHT_PORT ?? '3000';
  const port = Number(raw);
  if (
    !/^\d+$/.test(String(raw)) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new Error('PLAYWRIGHT_PORT must be an integer between 1 and 65535');
  return port;
}

export function resolvePlaywrightBaseUrl(env = process.env) {
  const port = resolvePlaywrightPort(env);
  if (!env.PLAYWRIGHT_BASE_URL) return `http://localhost:${port}`;
  const base = new URL(env.PLAYWRIGHT_BASE_URL);
  if (env.PLAYWRIGHT_PORT !== undefined && base.port !== String(port))
    throw new Error('PLAYWRIGHT_BASE_URL port must match PLAYWRIGHT_PORT');
  return base.toString().replace(/\/$/, '');
}

export function shouldReusePlaywrightServer(env = process.env) {
  resolvePlaywrightPort(env);
  return !env.CI && env.PLAYWRIGHT_PORT === undefined;
}

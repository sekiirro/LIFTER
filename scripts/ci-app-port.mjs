import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOSTED_APP_PORT = 3000;
export const SELF_HOSTED_APP_PORT = 3990;
export const FORBIDDEN_APP_PORTS = [3000, 3315, 3417, 3418, 3427, 3437, 3439];
export const FORBIDDEN_APP_RANGES = /** @type {const} */ ([
  [25420, 25429], // Stack B, read from supabase-stack-b/supabase/config.toml
  [35420, 35429], // Stack C, read from supabase-stack-c/supabase/config.toml
  [45420, 45429], // Stack D, read from its active stack config
  [54241, 54340], // Windows dynamic TCP range
  [54320, 54329], // Stack A
  [56420, 56429], // Self-hosted Supabase CI services
]);

export function isForbiddenAppPort(port) {
  return (
    FORBIDDEN_APP_PORTS.includes(port) ||
    FORBIDDEN_APP_RANGES.some(([start, end]) => port >= start && port <= end)
  );
}

export function selectAppPort(isSelfHosted) {
  const port = isSelfHosted ? SELF_HOSTED_APP_PORT : HOSTED_APP_PORT;
  if (isSelfHosted && isForbiddenAppPort(port))
    throw new Error(`Self-hosted CI app port ${port} is reserved`);
  return port;
}

export async function assertAppPortFree(port = SELF_HOSTED_APP_PORT) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`Invalid CI app port: ${port}`);
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (error) => {
      reject(new Error(`CI app port ${port} is not free: ${error.message}`));
    });
    server.listen({ host: '0.0.0.0', port, exclusive: true }, () => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const command = process.argv[2];
  if (command === 'select') {
    const isolated = process.argv[3];
    if (isolated !== 'true' && isolated !== 'false')
      throw new Error('select expects true or false');
    process.stdout.write(`${selectAppPort(isolated === 'true')}\n`);
  } else if (command === 'assert-free') {
    await assertAppPortFree();
  } else {
    throw new Error('Expected command: select or assert-free');
  }
}

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import TOML from '@iarna/toml';

export const CI_PROJECT_ID = 'lifter-stack-ci';
export const CI_PORT_BASE = 56420;
/** @type {readonly (readonly [string, string])[]} */
export const CI_PORT_KEYS = [
  ['api', 'port'],
  ['db', 'port'],
  ['db', 'shadow_port'],
  ['studio', 'port'],
  ['inbucket', 'port'],
  ['inbucket', 'smtp_port'],
  ['inbucket', 'pop3_port'],
  ['analytics', 'port'],
  ['edge_runtime', 'inspector_port'],
  ['db.pooler', 'port'],
];

export function selectCiPortMap(base = CI_PORT_BASE) {
  if (
    !Number.isInteger(base) ||
    base < 1024 ||
    base + CI_PORT_KEYS.length > 65536
  )
    throw new Error('Invalid CI Supabase port range');
  return Object.fromEntries(
    CI_PORT_KEYS.map(([section, key], index) => [
      `${section}.${key}`,
      base + index,
    ]),
  );
}

export function rewriteCiSupabaseConfig(source, portMap = selectCiPortMap()) {
  const parsed = TOML.parse(source);
  if (parsed.project_id !== 'lifter')
    throw new Error('Expected the tracked Supabase project id to be lifter');

  let section = '';
  const rewritten = source
    .split(/(?<=\n)/)
    .map((line) => {
      const header = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?(?:\r?\n)?$/);
      if (header) section = header[1];
      const entry = line.match(
        /^(\s*)([A-Za-z0-9_]+)(\s*=\s*)(\d+)(\s*(?:#.*)?(?:\r?\n)?)$/,
      );
      if (!entry) return line;
      const path = `${section}.${entry[2]}`;
      return Object.hasOwn(portMap, path)
        ? `${entry[1]}${entry[2]}${entry[3]}${portMap[path]}${entry[5]}`
        : line;
    })
    .join('')
    .replace(/^project_id\s*=\s*"lifter"/m, `project_id = "${CI_PROJECT_ID}"`);

  const config = TOML.parse(rewritten);
  const values = Object.keys(portMap).map((path) =>
    path.split('.').reduce((value, key) => value?.[key], config),
  );
  if (
    config.project_id !== CI_PROJECT_ID ||
    values.some((port) => !Number.isInteger(port)) ||
    new Set(values).size !== values.length
  )
    throw new Error(
      'CI Supabase config does not contain a unique port for every service',
    );
  return rewritten;
}

export async function waitForCiPortsFree(
  ports = Object.values(selectCiPortMap()),
  { timeoutMs = 90_000, retryMs = 1_000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let busy = [];
  do {
    busy = [];
    for (const port of ports) {
      const isFree = await new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)));
      });
      if (!isFree) busy.push(port);
    }
    if (busy.length === 0) return;
    if (Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, retryMs));
  } while (Date.now() < deadline);
  throw new Error(
    `CI Supabase ports still busy after ${timeoutMs}ms: ${busy.join(', ')}`,
  );
}

export function assertCiDockerClean() {
  const containers = execFileSync(
    'docker',
    ['ps', '--all', '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  )
    .trim()
    .split(/\r?\n/)
    .filter((name) => name.includes(CI_PROJECT_ID));
  const networks = execFileSync(
    'docker',
    ['network', 'ls', '--format', '{{.Name}}'],
    { encoding: 'utf8' },
  )
    .trim()
    .split(/\r?\n/)
    .filter((name) => name.includes(CI_PROJECT_ID));
  if (containers.length || networks.length)
    throw new Error(
      `CI Supabase cleanup left resources: ${[...containers, ...networks].join(', ')}`,
    );
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const configPath = process.argv[2] ?? 'supabase/config.toml';
  const command = process.argv[3] ?? 'rewrite';
  if (command === 'rewrite') {
    writeFileSync(
      configPath,
      rewriteCiSupabaseConfig(readFileSync(configPath, 'utf8')),
    );
  } else if (command === 'wait') {
    await waitForCiPortsFree();
  } else if (command === 'assert-clean') {
    assertCiDockerClean();
  } else {
    throw new Error(`Unknown CI Supabase config command: ${command}`);
  }
}

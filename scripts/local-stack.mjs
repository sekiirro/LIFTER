import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_A_PORTS = [
  54321, 54322, 54320, 54323, 54324, 54325, 54326, 54327, 8083, 54329,
];
const PORT_KEYS = [
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

function valueFor(configText, section, key) {
  const sectionHeader = `[${section}]`;
  const start = configText.indexOf(sectionHeader);
  if (start < 0) return undefined;
  const rest = configText.slice(start + sectionHeader.length);
  const nextSection = rest.search(/^\s*\[[^\]]+\]/m);
  const body = nextSection < 0 ? rest : rest.slice(0, nextSection);
  const match = body.match(new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)\\s*$`, 'm'));
  return match ? Number(match[1]) : undefined;
}

/** @param {{ LIFTER_SUPABASE_STACK?: string }} [env] */
export function selectStack(env = process.env) {
  const requested = env.LIFTER_SUPABASE_STACK;
  if (requested && !['a', 'b', 'c', 'd'].includes(requested))
    throw new Error('Unsupported local Supabase stack');
  if (requested) return requested;
  throw new Error('No local Supabase stack selected. Set LIFTER_SUPABASE_STACK to a, b, c, or d.');
}

export function getStackConfig(stack = 'a', root = process.cwd()) {
  if (!['a', 'b', 'c', 'd'].includes(stack))
    throw new Error('Unsupported local Supabase stack');
  const configPath =
    stack === 'a'
      ? path.join(root, 'supabase', 'config.toml')
      : path.join(root, `supabase-stack-${stack}`, 'supabase', 'config.toml');
  if (!existsSync(configPath)) {
    throw new Error(
      `Expected profile config at ${configPath}; profile ${stack} must be provisioned locally in the lane's worktree.`,
    );
  }
  const configText = readFileSync(configPath, 'utf8');
  const projectId = configText.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  const expectedProjectId = stack === 'a' ? 'lifter' : `lifter-stack-${stack}`;
  const ports = PORT_KEYS.map(
    ([section, key], index) =>
      valueFor(configText, section, key) ??
      (stack === 'a' ? DEFAULT_A_PORTS[index] : undefined),
  );
  if (
    projectId !== expectedProjectId ||
    ports.some((port) => !Number.isInteger(port))
  )
    throw new Error('Invalid local Supabase stack config');
  return {
    name: stack,
    projectId,
    configPath,
    configText,
    workdir: stack === 'a' ? root : path.join(root, `supabase-stack-${stack}`),
    envFile:
      stack === 'a'
        ? path.join(root, '.env.local')
        : path.join(root, `.env.stack-${stack}`),
    apiPort: ports[0],
    dbPort: ports[1],
    ports,
    security: {
      enableSignup: /^enable_signup\s*=\s*true$/m.test(configText),
      minimumPasswordLength: Number(
        configText.match(/^minimum_password_length\s*=\s*(\d+)/m)?.[1],
      ),
    },
  };
}

export function assertLocalStackTarget({
  stack = 'a',
  apiUrl,
  dbUrl,
  root = process.cwd(),
}) {
  const config = getStackConfig(stack, root);
  let api;
  let db;
  try {
    api = new URL(apiUrl);
    db = new URL(dbUrl);
  } catch {
    throw new Error('Local Supabase target required');
  }
  const validApi =
    api.protocol === 'http:' &&
    api.hostname === '127.0.0.1' &&
    api.port === String(config.apiPort);
  const validDb =
    db.hostname === '127.0.0.1' &&
    db.port === String(config.dbPort) &&
    db.pathname === '/postgres';
  if (!validApi || !validDb) throw new Error('Local Supabase target required');
  return config;
}

export function loadSelectedStackEnv(env = process.env, root = process.cwd()) {
  const stack = selectStack(env, root);
  if (stack === 'a') return stack;
  const envFile = getStackConfig(stack, root).envFile;
  let contents;
  try {
    contents = readFileSync(envFile, 'utf8');
  } catch {
    return stack;
  }
  for (const line of contents.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)="?([^"\r\n]*)"?$/);
    if (match && env[match[1]] === undefined) env[match[1]] = match[2];
  }
  return stack;
}

export function localSupabaseContainer(
  service,
  stack = selectStack(process.env),
) {
  const project = stack === 'a' ? 'lifter' : `lifter-stack-${stack}`;
  return `supabase_${service}_${project}`;
}

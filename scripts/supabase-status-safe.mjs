#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SAFE_HEALTH = new Set([
  'available',
  'healthy',
  'not running',
  'running',
  'starting',
  'stopped',
  'unhealthy',
  'up',
]);
const SECRET_FIELD = /(?:jwt|token|key|secret|password|credential|db[_-]?url)/i;
const SAFE_ERROR_MESSAGES = new Set([
  '--workdir must be an absolute path',
  '--expected-api-port must be a valid TCP port',
  '--expected-db-port must be a valid TCP port',
  '--workdir is required',
  '--expected-project-id is required',
  '--expected-api-port is required',
  '--expected-db-port is required',
  'Unknown argument',
  'Expected project id does not match the workdir Supabase config',
  'Expected API or DB port does not match the workdir Supabase config',
  'Supabase status project id does not match the expected project',
  'Supabase status API URL is missing or invalid',
  'Supabase status API URL must use HTTP or HTTPS',
  'Supabase status API URL has no explicit port',
  'Supabase status DB URL is missing or invalid',
  'Supabase status DB URL has no explicit port',
  'Supabase status API or DB port does not match the expected port',
  'Supabase project id must exist in supabase/config.toml',
  'invalid JSON from Supabase status',
  'npx-cli.js could not be resolved for Windows',
]);

/** Return a deep copy with credential-bearing fields removed. */
export function redactSensitiveFields(value) {
  if (Array.isArray(value)) return value.map(redactSensitiveFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SECRET_FIELD.test(key))
      .map(([key, nested]) => [key, redactSensitiveFields(nested)]),
  );
}

export function parseStatusOutput(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('invalid JSON from Supabase status');
  }
}

export function reportCliError(error) {
  const message =
    error instanceof Error && SAFE_ERROR_MESSAGES.has(error.message)
      ? error.message
      : 'failed';
  return `supabase-status-safe: ${message}\n`;
}

function isAbsoluteForPlatform(workdir, platform) {
  return platform === 'win32'
    ? path.win32.isAbsolute(workdir)
    : path.posix.isAbsolute(workdir);
}

function resolveNpxCliPath(execPath, env = process.env) {
  const winPath = path.win32;
  const npmExecPath = env.npm_execpath;
  const candidates = [
    ...(npmExecPath && /npm-cli\.js$/i.test(npmExecPath)
      ? [winPath.join(winPath.dirname(npmExecPath), 'npx-cli.js')]
      : []),
    winPath.join(
      winPath.dirname(execPath),
      'node_modules',
      'npm',
      'bin',
      'npx-cli.js',
    ),
  ];
  const result = candidates.find((candidate) => existsSync(candidate));
  if (!result) throw new Error('npx-cli.js could not be resolved for Windows');
  return result;
}

/**
 * @param {string} workdir
 * @param {{ platform?: NodeJS.Platform, execFile?: typeof execFileSync, execPath?: string, npxCliPath?: string }} options
 */
export function runSupabaseCommand(
  workdir,
  {
    platform = process.platform,
    execFile = execFileSync,
    execPath = process.execPath,
    npxCliPath,
  } = {},
) {
  if (!isAbsoluteForPlatform(workdir, platform)) {
    throw new Error('--workdir must be an absolute path');
  }
  const supabaseArgs = [
    '--yes',
    'supabase@2.122.0',
    'status',
    '-o',
    'json',
    '--workdir',
    workdir,
  ];
  const executable = platform === 'win32' ? execPath : 'npx';
  const args =
    platform === 'win32'
      ? [npxCliPath ?? resolveNpxCliPath(execPath), ...supabaseArgs]
      : supabaseArgs;
  return execFile(executable, args, {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function requiredPort(value, name) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const option = name === '--expected-api-port' ? name : '--expected-db-port';
    throw new Error(`${option} must be a valid TCP port`);
  }
  return port;
}

function portFromUrl(value, name) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} is missing or invalid`);
  }
  const port = Number(parsed.port);
  if (!port) throw new Error(`${name} has no explicit port`);
  return port;
}

function safeApiUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Supabase status API URL is missing or invalid');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Supabase status API URL must use HTTP or HTTPS');
  }
  return parsed.origin;
}

function healthProjection(services) {
  if (!services || typeof services !== 'object' || Array.isArray(services))
    return {};
  const result = {};
  for (const [name, value] of Object.entries(services)) {
    if (!/^[a-z][a-z0-9_-]*$/i.test(name)) continue;
    const raw =
      typeof value === 'string' ? value : (value?.status ?? value?.health);
    if (typeof raw !== 'string') continue;
    const status = raw.toLowerCase();
    if (SAFE_HEALTH.has(status)) result[name] = status;
  }
  return result;
}

/** Validate identity and return only fields that are safe to print. */
export function validateAndRedactStatus(status, expected) {
  if (
    !expected ||
    typeof expected.workdir !== 'string' ||
    !path.isAbsolute(expected.workdir)
  ) {
    throw new Error('--workdir must be an absolute path');
  }
  const projectId = expected.projectId;
  const apiPort = requiredPort(expected.apiPort, '--expected-api-port');
  const dbPort = requiredPort(expected.dbPort, '--expected-db-port');
  const config = expected.config;
  if (!projectId || !config || config.projectId !== projectId) {
    throw new Error(
      'Expected project id does not match the workdir Supabase config',
    );
  }
  if (config.apiPort !== apiPort || config.dbPort !== dbPort) {
    throw new Error(
      'Expected API or DB port does not match the workdir Supabase config',
    );
  }
  if (status?.project_id && status.project_id !== projectId) {
    throw new Error(
      'Supabase status project id does not match the expected project',
    );
  }

  const apiUrl = safeApiUrl(status?.API_URL ?? status?.api_url);
  const observedApiPort = portFromUrl(apiUrl, 'Supabase status API URL');
  const observedDbPort = portFromUrl(
    status?.DB_URL ?? status?.db_url,
    'Supabase status DB URL',
  );
  if (observedApiPort !== apiPort || observedDbPort !== dbPort) {
    throw new Error(
      'Supabase status API or DB port does not match the expected port',
    );
  }
  const safeStatus = redactSensitiveFields(status);
  return {
    apiUrl: safeApiUrl(safeStatus.API_URL ?? safeStatus.api_url),
    dbPort: observedDbPort,
    projectId,
    serviceHealth: healthProjection(
      safeStatus.services ?? safeStatus.service_health,
    ),
  };
}

function readConfig(workdir) {
  const configText = readFileSync(
    path.join(workdir, 'supabase', 'config.toml'),
    'utf8',
  );
  const section = (name) => {
    const header = new RegExp(`^\\[${name}\\]\\s*$`, 'm').exec(configText);
    return header
      ? configText.slice(header.index + header[0].length).split(/^\[/m, 1)[0]
      : '';
  };
  const projectId = configText.match(/^project_id\s*=\s*"([^"]+)"\s*$/m)?.[1];
  const apiPort =
    section('api').match(/^port\s*=\s*(\d+)\s*$/m)?.[1] ?? '54321';
  const dbPort = section('db').match(/^port\s*=\s*(\d+)\s*$/m)?.[1] ?? '54322';
  if (!projectId)
    throw new Error('Supabase project id must exist in supabase/config.toml');
  return { projectId, apiPort: Number(apiPort), dbPort: Number(dbPort) };
}

function parseArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (
      ![
        '--workdir',
        '--expected-project-id',
        '--expected-api-port',
        '--expected-db-port',
      ].includes(name)
    ) {
      throw new Error('Unknown argument');
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--'))
      throw new Error(`${name} is required`);
    values.set(name, value);
    index += 1;
  }
  for (const name of [
    '--workdir',
    '--expected-project-id',
    '--expected-api-port',
    '--expected-db-port',
  ]) {
    if (!values.has(name)) throw new Error(`${name} is required`);
  }
  if (!path.isAbsolute(values.get('--workdir')))
    throw new Error('--workdir must be an absolute path');
  return {
    workdir: values.get('--workdir'),
    projectId: values.get('--expected-project-id'),
    apiPort: requiredPort(
      values.get('--expected-api-port'),
      '--expected-api-port',
    ),
    dbPort: requiredPort(
      values.get('--expected-db-port'),
      '--expected-db-port',
    ),
  };
}

function run() {
  const expected = parseArgs(process.argv.slice(2));
  expected.config = readConfig(expected.workdir);
  const raw = runSupabaseCommand(expected.workdir);
  const status = parseStatusOutput(raw);
  process.stdout.write(
    `${JSON.stringify(validateAndRedactStatus(status, expected), null, 2)}\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    run();
  } catch (error) {
    process.stderr.write(reportCliError(error));
    process.exitCode = 1;
  }
}

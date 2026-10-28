import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertSignupServerOutputSafe,
  collectProductionServerOutput,
} from './client-signup-edge-proof.mjs';

const serverOutput = collectProductionServerOutput();
const signupServiceFiles = assertSignupServerOutputSafe(serverOutput);

function filesUnder(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path).flatMap((name) => {
    const full = resolve(path, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

const clientRoots = [resolve('.open-next/assets'), resolve('.next/static')];
const clientFiles = clientRoots.flatMap(filesUnder);
if (clientFiles.length === 0)
  throw new Error('Client bundle output is missing');

const envPath = resolve('.env.local');
if (!existsSync(envPath)) throw new Error('Local build environment is missing');
const envValues = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^([A-Z][A-Z0-9_]*)="?([^"\r\n]*)"?$/);
      return match ? [[match[1], match[2]]] : [];
    }),
);
const serviceRoleKey = envValues.SUPABASE_SERVICE_ROLE_KEY;
const signupValues = Object.entries(envValues)
  .filter(
    ([name, value]) =>
      name.startsWith('SIGNUP_') &&
      typeof value === 'string' &&
      value.length > 0,
  )
  .map(([, value]) => value);
if (
  typeof serviceRoleKey !== 'string' ||
  !envValues.SIGNUP_RATE_KEY ||
  !envValues.SIGNUP_ATTEST_KEY ||
  signupValues.length < 2
)
  throw new Error('Signup edge proof is missing local secret inputs');
for (const file of clientFiles) {
  const contents = readFileSync(file);
  if (
    [serviceRoleKey, ...signupValues].some((secret) =>
      contents.includes(Buffer.from(secret)),
    )
  )
    throw new Error('Signup secret material found in a client bundle');
}

console.log(
  `Client signup edge proof passed: ${serverOutput.length} production server files scanned; signup marker in ${signupServiceFiles.join(', ')}; test-IP override identifiers absent from production server output and dynamic NODE_ENV absent from signup service output; ${clientFiles.length} client assets scanned.`,
);

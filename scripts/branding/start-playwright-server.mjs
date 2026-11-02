import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareLocalBrandingProxyCredential } from './local-playwright-credential.mjs';

// The Stack-safe CLI exports API_URL/ANON_KEY/SERVICE_ROLE_KEY while Next's
// server helpers intentionally consume the SUPABASE_* names. Keep the app
// server environment complete in local runs as well as CI.
process.env.SUPABASE_URL ??= process.env.API_URL;
process.env.SUPABASE_ANON_KEY ??= process.env.ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY ??= process.env.SERVICE_ROLE_KEY;
process.env.APP_ORIGIN ??= 'http://localhost:3000';
process.env.LIFTER_E2E_ALLOW_HTTP = 'true';

const credential = await prepareLocalBrandingProxyCredential();
if (credential) process.env.BRANDING_PROXY_JWT = credential;

const server = spawn(
  process.execPath,
  [
    fileURLToPath(
      new URL('../../tests/e2e/start-server-capture.mjs', import.meta.url),
    ),
  ],
  { cwd: process.cwd(), env: process.env, stdio: 'inherit' },
);
process.once('SIGTERM', () => server.kill('SIGTERM'));
process.once('SIGINT', () => server.kill('SIGINT'));
server.on('error', () => {
  process.exitCode = 1;
});
server.on('exit', (code) => {
  process.exitCode = code ?? 1;
});

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareLocalBrandingProxyCredential } from './local-playwright-credential.mjs';

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

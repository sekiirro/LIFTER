import { spawn } from 'node:child_process';
import { rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const summaryPath =
  process.env.U8_SERVER_LOG_SUMMARY_PATH ??
  join(tmpdir(), 'lftr-u8-server-log-summary.json');
const temporaryPath = `${summaryPath}.tmp`;
const summary = {
  totalLines: 0,
  stdoutLines: 0,
  stderrLines: 0,
  registrationRelatedLines: 0,
  errorLikeLines: 0,
  storedPayload: 'scrubbed counts only',
};
let pendingWrite = Promise.resolve();

function persistSummary() {
  pendingWrite = pendingWrite.then(async () => {
    await writeFile(temporaryPath, JSON.stringify(summary), 'utf8');
    await rename(temporaryPath, summaryPath);
  });
  return pendingWrite;
}

await persistSummary();
const server = spawn(
  process.execPath,
  [join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start'],
  { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
);
let stopping = false;

function collect(stream, streamName) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (!line) continue;
      summary.totalLines += 1;
      summary[streamName] += 1;
      if (/register|client.signup|client_signup|server.action/i.test(line))
        summary.registrationRelatedLines += 1;
      if (/\b(error|failed|exception|fatal)\b/i.test(line))
        summary.errorLikeLines += 1;
    }
    void persistSummary();
  });
  stream.on('end', () => {
    if (!pending) return;
    summary.totalLines += 1;
    summary[streamName] += 1;
    if (/register|client.signup|client_signup|server.action/i.test(pending))
      summary.registrationRelatedLines += 1;
    if (/\b(error|failed|exception|fatal)\b/i.test(pending))
      summary.errorLikeLines += 1;
    void persistSummary();
  });
}

collect(server.stdout, 'stdoutLines');
collect(server.stderr, 'stderrLines');

function stopServer() {
  if (stopping) return;
  stopping = true;
  server.kill();
}

process.on('SIGTERM', stopServer);
process.on('SIGINT', stopServer);
server.on('error', async () => {
  await persistSummary();
  process.exit(1);
});
server.on('exit', async (code) => {
  await persistSummary();
  process.exitCode = code ?? (stopping ? 0 : 1);
});

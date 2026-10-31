import { spawn } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const rawPath =
  process.env.U8_SERVER_LOG_RAW_PATH ??
  join(tmpdir(), `lftr-u8-${process.pid}-server.log`);
const summaryPath =
  process.env.U8_SERVER_LOG_SUMMARY_PATH ??
  join(tmpdir(), `lftr-u8-${process.pid}-summary.json`);
const activePath =
  process.env.U8_SERVER_LOG_MANIFEST_PATH ??
  join(tmpdir(), `lftr-u8-${process.pid}-manifest.json`);
const temporaryPath = `${summaryPath}.tmp`;
const summary = {
  totalLines: 0,
  captureStarted: true,
  stdoutLines: 0,
  stderrLines: 0,
  registrationRelatedLines: 0,
  errorLikeLines: 0,
  storedPayload: 'scrubbed counts only',
  rawLogDeleted: false,
};

function persistSummary() {
  writeFileSync(temporaryPath, JSON.stringify(summary), 'utf8');
  renameSync(temporaryPath, summaryPath);
}

await writeFile(rawPath, '', 'utf8');
writeFileSync(activePath, JSON.stringify({ rawPath, summaryPath }), 'utf8');
persistSummary();
const server = spawn(
  process.execPath,
  [join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start'],
  { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
);
let stopping = false;
let finalized = false;
let rawDisabled = false;

function recordLine(line, streamName) {
  summary.totalLines += 1;
  summary[streamName] += 1;
  if (/register|client.signup|client_signup|server.action/i.test(line))
    summary.registrationRelatedLines += 1;
  if (/\b(error|failed|exception|fatal)\b/i.test(line))
    summary.errorLikeLines += 1;
  if (!rawDisabled) appendFileSync(rawPath, `${line}\n`, 'utf8');
  persistSummary();
}

function collect(stream, streamName) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) recordLine(line, streamName);
  });
  stream.on('end', () => {
    if (pending) recordLine(pending, streamName);
  });
}

collect(server.stdout, 'stdoutLines');
collect(server.stderr, 'stderrLines');

function cleanRawLog() {
  if (rawDisabled) return;
  rawDisabled = true;
  try {
    unlinkSync(rawPath);
  } catch {
    // The file may already have been removed by finalization.
  }
  summary.rawLogDeleted = !existsSync(rawPath);
  persistSummary();
}

function stopServer() {
  if (stopping) return;
  stopping = true;
  server.kill();
  cleanRawLog();
}

function finalize() {
  if (finalized) return;
  finalized = true;
  cleanRawLog();
}

process.on('SIGTERM', stopServer);
process.on('SIGINT', stopServer);
process.on('exit', cleanRawLog);
server.on('error', () => {
  finalize();
  process.exitCode = 1;
});
server.on('exit', (code) => {
  finalize();
  process.exitCode = code ?? (stopping ? 0 : 1);
});

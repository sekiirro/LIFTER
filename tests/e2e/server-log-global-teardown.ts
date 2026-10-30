import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serverLogRawPath, serverLogSummaryPath } from './server-log-capture';
import { hasCapturedServerLogs } from './server-log-capture-state';

export default async function verifyServerLogCleanup() {
  const rawPath = serverLogRawPath;
  const summaryPath = serverLogSummaryPath;
  const manifestPath =
    process.env.U8_SERVER_LOG_MANIFEST_PATH ??
    join(tmpdir(), `lftr-u8-${process.pid}-manifest.json`);
  if (!rawPath || !summaryPath)
    throw new Error('Server log cleanup verification failed.');
  try {
    unlinkSync(rawPath);
  } catch {
    // The wrapper may already have removed the file.
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as {
    rawLogDeleted?: boolean;
    captureStarted?: boolean;
    totalLines?: number;
  };
  if (!hasCapturedServerLogs(summary))
    throw new Error('Server log capture did not run.');
  summary.rawLogDeleted = !existsSync(rawPath);
  writeFileSync(`${summaryPath}.tmp`, JSON.stringify(summary), 'utf8');
  renameSync(`${summaryPath}.tmp`, summaryPath);
  process.once('exit', () => {
    let deleted = Boolean(rawPath && summaryPath && !existsSync(rawPath));
    try {
      const summary = JSON.parse(readFileSync(summaryPath!, 'utf8')) as {
        rawLogDeleted?: boolean;
        captureStarted?: boolean;
        totalLines?: number;
      };
      deleted =
        deleted &&
        summary.rawLogDeleted === true &&
        hasCapturedServerLogs(summary);
    } catch {
      deleted = false;
    }
    if (!deleted) {
      process.exitCode = 1;
      console.error('Server log cleanup verification failed.');
    }
    try {
      unlinkSync(manifestPath);
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        process.exitCode = 1;
    }
  });
}

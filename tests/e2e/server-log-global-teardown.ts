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

export default async function verifyServerLogCleanup() {
  const rawPath = serverLogRawPath;
  const summaryPath = serverLogSummaryPath;
  const manifestPath = join(tmpdir(), 'lftr-u8-server-log-current.json');
  if (!rawPath || !summaryPath)
    throw new Error('Server log cleanup verification failed.');
  try {
    unlinkSync(rawPath);
  } catch {
    // The wrapper may already have removed the file.
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as {
    rawLogDeleted?: boolean;
  };
  summary.rawLogDeleted = !existsSync(rawPath);
  writeFileSync(`${summaryPath}.tmp`, JSON.stringify(summary), 'utf8');
  renameSync(`${summaryPath}.tmp`, summaryPath);
  process.once('exit', () => {
    let deleted = Boolean(rawPath && summaryPath && !existsSync(rawPath));
    try {
      const summary = JSON.parse(readFileSync(summaryPath!, 'utf8')) as {
        rawLogDeleted?: boolean;
      };
      deleted = deleted && summary.rawLogDeleted === true;
    } catch {
      deleted = false;
    }
    if (!deleted) {
      process.exitCode = 1;
      console.error('Server log cleanup verification failed.');
    }
    try {
      unlinkSync(manifestPath);
    } catch {
      process.exitCode = 1;
    }
  });
}

import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const manifestPath = join(tmpdir(), 'lftr-u8-server-log-current.json');
const paths = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  rawPath: string;
  summaryPath: string;
};

export const serverLogRawPath = paths.rawPath;
export const serverLogSummaryPath = paths.summaryPath;

export type ServerLogSummary = {
  totalLines: number;
  stdoutLines: number;
  stderrLines: number;
  registrationRelatedLines: number;
  errorLikeLines: number;
  storedPayload: 'scrubbed counts only';
  rawLogDeleted: boolean;
};

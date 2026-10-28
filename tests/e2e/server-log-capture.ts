import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const serverLogSummaryPath = join(
  tmpdir(),
  'lftr-u8-server-log-summary.json',
);

export type ServerLogSummary = {
  totalLines: number;
  stdoutLines: number;
  stderrLines: number;
  registrationRelatedLines: number;
  errorLikeLines: number;
  storedPayload: 'scrubbed counts only';
};

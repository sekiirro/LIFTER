import { fileURLToPath } from 'node:url';

export function parseStoragePlaywrightSummary(output) {
  const lines = String(output).split(/\r?\n/);
  const summary = [...lines]
    .reverse()
    .find((line) =>
      /\b(?:passed|skipped|failed|flaky|interrupted)\b/.test(line),
    );
  const counts = {
    passed: 0,
    skipped: 0,
    failed: 0,
    flaky: 0,
    interrupted: 0,
  };
  if (summary) {
    for (const key of Object.keys(counts)) {
      const match = summary.match(new RegExp(`(?:^|[,\\s])([0-9]+) ${key}\\b`));
      if (match) counts[key] = Number(match[1]);
    }
  }
  return {
    ...counts,
    acceptable:
      counts.passed === 1 &&
      counts.skipped === 0 &&
      counts.failed === 0 &&
      counts.flaky === 0 &&
      counts.interrupted === 0,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(
    JSON.stringify(
      parseStoragePlaywrightSummary(process.env.U8_STORAGE_RESULT_INPUT ?? ''),
    ),
  );
}

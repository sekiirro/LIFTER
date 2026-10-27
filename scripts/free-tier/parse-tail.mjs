import { readFile } from 'node:fs/promises';
import { parseArgs } from '../backup/lib/args.mjs';
import { normalizeRoute } from './lib/routes.mjs';
import { percentile, verdict } from './lib/stats.mjs';
import { isMain, output, positive, run } from './lib/cli.mjs';

function* tailObjects(text) {
  let buffer = '';
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of text) {
    if (depth === 0) {
      if (character === '{') {
        if (buffer.trim()) yield buffer;
        buffer = '{';
        depth = 1;
      } else if (character === '\n') {
        if (buffer.trim()) yield buffer;
        buffer = '';
      } else buffer += character;
      continue;
    }
    buffer += character;
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) {
      yield buffer;
      buffer = '';
    }
  }
  if (buffer.trim()) yield buffer;
}

export function parseTail(text, cpuLimitMs = 10) {
  positive(cpuLimitMs, 10);
  const groups = new Map();
  let invalid_lines = 0;
  for (const object of tailObjects(text)) {
    let event, route;
    try {
      event = JSON.parse(object);
      if (
        typeof event.event?.request?.method !== 'string' ||
        typeof event.event?.request?.url !== 'string'
      )
        throw new Error('Invalid event');
      route = normalizeRoute(
        event.event.request.method,
        event.event.request.url,
      );
    } catch {
      invalid_lines++;
      continue;
    }
    if (!groups.has(route))
      groups.set(route, { count: 0, cpu: [], wall: [], outcomes: {} });
    const group = groups.get(route);
    group.count++;
    for (const [field, samples] of [
      ['cpuTime', group.cpu],
      ['wallTime', group.wall],
    ]) {
      if (Number.isFinite(event[field]) && event[field] >= 0)
        samples.push(event[field]);
    }
    const outcome = [
      'ok',
      'exception',
      'exceededCpu',
      'exceededMemory',
      'canceled',
      'unknown',
      'responseStreamDisconnected',
    ].includes(event.outcome)
      ? event.outcome
      : 'other';
    group.outcomes[outcome] = (group.outcomes[outcome] ?? 0) + 1;
  }
  const rank = (samples, p) => (samples.length ? percentile(samples, p) : null);
  return {
    invalid_lines,
    cpu_limit_ms: cpuLimitMs,
    routes: [...groups].map(([route, group]) => {
      const max = group.cpu.length
        ? group.cpu.reduce((a, b) => Math.max(a, b), 0)
        : null;
      return {
        route,
        count: group.count,
        cpu_p50_ms: rank(group.cpu, 50),
        cpu_p95_ms: rank(group.cpu, 95),
        cpu_max_ms: max,
        wall_p50_ms: rank(group.wall, 50),
        wall_p95_ms: rank(group.wall, 95),
        verdict: max === null ? null : verdict(max, cpuLimitMs),
        outcomes: group.outcomes,
      };
    }),
  };
}

export async function main(input = process.argv.slice(2)) {
  const [file, ...argv] = input;
  if (!file || file.startsWith('--')) throw new Error('Tail file is required');
  const args = parseArgs(argv, ['cpu-limit-ms', 'json']);
  const report = parseTail(
    await readFile(file, 'utf8'),
    positive(args['cpu-limit-ms'], 10),
  );
  console.table(
    report.routes.map((row) => ({
      ...row,
      outcomes: JSON.stringify(row.outcomes),
    })),
  );
  console.log(`Invalid lines: ${report.invalid_lines}`);
  await output(report, args.json);
}
if (isMain(import.meta.url)) run(main);

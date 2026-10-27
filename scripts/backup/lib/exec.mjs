import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { delimiter, dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { redact } from './redact.mjs';
import { CLI_VERSION } from './manifest.mjs';

export class CommandError extends Error {
  constructor(stderr = '') {
    super('COMMAND_FAILED');
    this.stderr = redact(stderr);
  }
}
export async function npxCommand(args) {
  const candidates = [
    join(dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js'),
    ...(process.env.npm_execpath
      ? [join(dirname(process.env.npm_execpath), 'npx-cli.js')]
      : []),
    resolve(
      dirname(process.execPath),
      '../lib/node_modules/npm/bin/npx-cli.js',
    ),
    ...(process.env.PATH ?? '')
      .split(process.platform === 'win32' ? ';' : ':')
      .map((dir) => join(dir, 'node_modules/npm/bin/npx-cli.js')),
  ];
  for (const path of candidates) {
    try {
      await access(path);
      return [
        process.execPath,
        [path, '--yes', `supabase@${CLI_VERSION}`, ...args],
      ];
    } catch {
      /* Try the next npm installation. */
    }
  }
  if (process.platform !== 'win32')
    return ['npx', ['--yes', `supabase@${CLI_VERSION}`, ...args]];
  throw new CommandError(
    'Cannot locate npm npx-cli.js; run through npm run or install Node with npm.',
  );
}
export async function run(command, args, { output, input } = {}) {
  let child;
  const env = process.env.DOCKER_BIN
    ? {
        ...process.env,
        PATH: `${dirname(resolve(process.env.DOCKER_BIN))}${delimiter}${process.env.PATH ?? ''}`,
      }
    : process.env;
  try {
    child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    throw new CommandError();
  }
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-65536);
  });
  const done = new Promise((resolve, reject) => {
    child.once('error', () => reject(new CommandError(stderr)));
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new CommandError(stderr)),
    );
  });
  // Attach a handler immediately: process exit can precede stream completion.
  done.catch(() => {});
  let captured = '';
  const reading = output
    ? output(child.stdout)
    : (async () => {
        for await (const chunk of child.stdout) {
          captured += chunk.toString();
          if (captured.length > 4 * 1024 * 1024)
            throw new CommandError('Output limit exceeded');
        }
      })();
  const writing = input
    ? pipeline(input, child.stdin)
    : Promise.resolve(child.stdin.end());
  try {
    await Promise.all([done, reading, writing]);
  } catch (error) {
    child.kill();
    child.stdout.destroy();
    child.stdin.destroy();
    // Wait for encrypted output files to close before the caller removes a partial backup.
    await Promise.allSettled([done, reading, writing]);
    throw error instanceof CommandError ? error : new CommandError(stderr);
  }
  return captured;
}
export async function supabase(args, options) {
  const [command, argv] = await npxCommand(args);
  return run(command, argv, options);
}
export const docker = (args, options) =>
  run(process.env.DOCKER_BIN || 'docker', args, options);

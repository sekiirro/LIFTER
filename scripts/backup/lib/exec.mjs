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
export class TimeoutError extends CommandError {
  constructor(stderr = '') {
    super(stderr);
    this.message = 'TIMEOUT';
    this.code = 'TIMEOUT';
  }
}
export class InterruptedError extends CommandError {
  constructor(stderr = '') {
    super(stderr);
    this.message = 'INTERRUPTED';
    this.code = 'INTERRUPTED';
  }
}

const signalWatchers = new WeakMap();

// Share one pair of listeners across concurrent commands. The signal source is
// injectable so tests never send operator signals to the test runner.
export function watchInterruptions(
  terminate,
  { signals = process, stderr = () => '' } = {},
) {
  let error;
  let receive;
  let disposed = false;
  const promise = new Promise((resolve, reject) => {
    receive = () => {
      if (error) return;
      error = new InterruptedError(stderr());
      Promise.resolve()
        .then(terminate)
        .then(
          () => reject(error),
          () => reject(error),
        );
    };
  });
  let shared = signalWatchers.get(signals);
  if (!shared) {
    const watchers = new Set();
    const listener = () => {
      for (const watcher of watchers) watcher();
    };
    shared = { watchers, listener };
    signalWatchers.set(signals, shared);
    signals.on('SIGINT', listener);
    signals.on('SIGTERM', listener);
  }
  shared.watchers.add(receive);
  return {
    promise,
    get error() {
      return error;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      shared.watchers.delete(receive);
      if (shared.watchers.size === 0) {
        signals.off('SIGINT', shared.listener);
        signals.off('SIGTERM', shared.listener);
        signalWatchers.delete(signals);
      }
    },
  };
}

async function terminateTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    await new Promise((resolve, reject) => {
      const killer = spawn(
        'taskkill',
        ['/PID', String(child.pid), '/T', '/F'],
        {
          shell: false,
          windowsHide: true,
          stdio: 'ignore',
        },
      );
      killer.once('error', reject);
      killer.once('close', resolve);
    });
    return;
  }
  const signal = (name) => {
    try {
      process.kill(-child.pid, name);
      return true;
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
      return false;
    }
  };
  if (!signal('SIGTERM')) return;
  await new Promise((resolve) => {
    const deadline = setTimeout(() => {
      clearInterval(check);
      signal('SIGKILL');
      resolve();
    }, 10000);
    const check = setInterval(() => {
      if (!signal(0)) {
        clearTimeout(deadline);
        clearInterval(check);
        resolve();
      }
    }, 50);
  });
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
export async function run(
  command,
  args,
  { output, input, timeoutMs = 30 * 60 * 1000 } = {},
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647)
    throw new RangeError('timeoutMs must be between 0 and 2147483647');
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
      detached: process.platform !== 'win32',
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
  let termination;
  const stop = () => (termination ||= terminateTree(child));
  const interruption = watchInterruptions(stop, { stderr: () => stderr });
  child.once('close', interruption.dispose);
  let captured = '';
  const reading = output
    ? Promise.resolve().then(() => output(child.stdout))
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
  let timer;
  let timeoutError;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      timeoutError = new TimeoutError(stderr);
      stop().then(
        () => reject(timeoutError),
        () => reject(timeoutError),
      );
    }, timeoutMs);
  });
  try {
    await Promise.race([
      Promise.all([done, reading, writing]),
      timeout,
      interruption.promise,
    ]);
    if (interruption.error) throw interruption.error;
    if (timeoutError) throw timeoutError;
  } catch (error) {
    await stop().catch(() => {});
    child.stdout.destroy();
    child.stdin.destroy();
    // Wait for encrypted output files to close before the caller removes a partial backup.
    await Promise.allSettled([done, reading, writing]);
    throw (
      interruption.error ||
      timeoutError ||
      (error instanceof CommandError ? error : new CommandError(stderr))
    );
  } finally {
    clearTimeout(timer);
    interruption.dispose();
    child.off('close', interruption.dispose);
  }
  return captured;
}
export async function supabase(args, options) {
  const [command, argv] = await npxCommand(args);
  return run(command, argv, {
    timeoutMs: ['start', 'stop'].includes(args[0])
      ? 10 * 60 * 1000
      : 30 * 60 * 1000,
    ...options,
  });
}
export const docker = (args, options) =>
  run(process.env.DOCKER_BIN || 'docker', args, options);

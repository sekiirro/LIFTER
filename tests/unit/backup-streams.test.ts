import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  Encrypter,
  Decrypter,
  generateIdentity,
  identityToRecipient,
} from 'age-encryption';
import {
  CommandError,
  InterruptedError,
  TimeoutError,
  npxCommand,
  run,
  watchInterruptions,
} from '../../scripts/backup/lib/exec.mjs';

const roots: string[] = [];
it('times out a sleeping Node process and terminates it', async () => {
  const pids: number[] = [];
  await expect(
    run(
      process.execPath,
      ['-e', 'console.log(process.pid); setTimeout(()=>{},60000)'],
      {
        timeoutMs: 2000,
        output: async (stream) => {
          let output = '';
          for await (const chunk of stream) output += chunk.toString();
          pids.push(...output.trim().split(/\s+/).filter(Boolean).map(Number));
        },
      },
    ),
  ).rejects.toMatchObject({ code: 'TIMEOUT' });
  expect(pids).toHaveLength(1);
  for (const pid of pids) expect(() => process.kill(pid, 0)).toThrow();
}, 14000);

it.each(['SIGINT', 'SIGTERM'])(
  'awaits tree termination before rejecting with INTERRUPTED on %s',
  async (signal) => {
    const signals = new EventEmitter();
    let finish!: () => void;
    const terminate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const interruption = watchInterruptions(terminate, {
      signals,
      stderr: () => 'password=secret',
    });
    const rejected = expect(interruption.promise).rejects.toMatchObject({
      code: 'INTERRUPTED',
      stderr: 'password=[REDACTED]',
    });
    let settled = false;
    interruption.promise.catch(() => {
      settled = true;
    });
    try {
      signals.emit(signal);
      signals.emit(signal);
      await Promise.resolve();
      expect(terminate).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false);
      expect(interruption.error).toBeInstanceOf(InterruptedError);
      expect(interruption.error).toBeInstanceOf(CommandError);
      finish();
      await rejected;
    } finally {
      interruption.dispose();
    }
    expect(signals.listenerCount('SIGINT')).toBe(0);
    expect(signals.listenerCount('SIGTERM')).toBe(0);
  },
);

it('shares signal listeners and leaves settled commands alone', async () => {
  const signals = new EventEmitter();
  const stopped = vi.fn(async () => {});
  const active = vi.fn(async () => {});
  const first = watchInterruptions(stopped, { signals });
  const second = watchInterruptions(active, { signals });
  const rejected = expect(second.promise).rejects.toMatchObject({
    code: 'INTERRUPTED',
  });
  try {
    expect(signals.listenerCount('SIGINT')).toBe(1);
    expect(signals.listenerCount('SIGTERM')).toBe(1);
    first.dispose();
    first.dispose();
    signals.emit('SIGINT');
    await rejected;
    expect(stopped).not.toHaveBeenCalled();
    expect(active).toHaveBeenCalledOnce();
  } finally {
    first.dispose();
    second.dispose();
  }
  expect(signals.listenerCount('SIGINT')).toBe(0);
  expect(signals.listenerCount('SIGTERM')).toBe(0);
});

it('allows commands to finish before their timeout', async () => {
  expect(
    await run(process.execPath, ['-e', "process.stdout.write('done')"], {
      timeoutMs: 5000,
    }),
  ).toBe('done');
  expect(new TimeoutError()).toBeInstanceOf(CommandError);
});
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
it('encrypts a multi-chunk stream and decrypts it without a plaintext file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'backup stream '));
  roots.push(root);
  const path = join(root, 'dump.age');
  const identity = await generateIdentity();
  const e = new Encrypter();
  e.addRecipient(await identityToRecipient(identity));
  // Node and DOM stream declarations differ in TS6; their runtime objects interoperate.
  const source = Readable.toWeb(
    Readable.from([Buffer.from('sentinel '.repeat(20000))]),
  ) as unknown as ReadableStream<Uint8Array>;
  const encrypted = await e.encrypt(source);
  await encrypted.pipeTo(
    Writable.toWeb(
      createWriteStream(path, { flags: 'wx' }),
    ) as unknown as WritableStream<Uint8Array>,
  );
  expect((await readFile(path)).includes(Buffer.from('sentinel'))).toBe(false);
  const d = new Decrypter();
  d.addIdentity(identity);
  const decrypted = await d.decrypt(
    Readable.toWeb(
      createReadStream(path),
    ) as unknown as ReadableStream<Uint8Array>,
  );
  expect(await new Response(decrypted).text()).toBe('sentinel '.repeat(20000));
  const wrong = new Decrypter();
  wrong.addIdentity(await generateIdentity());
  await expect(
    wrong.decrypt(
      Readable.toWeb(
        createReadStream(path),
      ) as unknown as ReadableStream<Uint8Array>,
    ),
  ).rejects.toThrow();
});
it('redacts typed command errors', () => {
  const error = new CommandError(
    'postgres://user:secret@host/db password=secret AGE-SECRET-KEY-1ABC',
  );
  expect(error.stderr).not.toContain('secret');
  expect(error.stderr).not.toContain('1ABC');
});
it('launches npx with an argument array through Node', async () => {
  const [command, args] = await npxCommand([
    'status',
    '--workdir',
    'C:\\path with spaces',
  ]);
  expect(command).toBe(process.execPath);
  expect(args.slice(-5)).toEqual([
    '--yes',
    'supabase@2.122.0',
    'status',
    '--workdir',
    'C:\\path with spaces',
  ]);
});

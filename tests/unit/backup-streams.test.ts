import { afterEach, expect, it } from 'vitest';
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
import { CommandError, npxCommand } from '../../scripts/backup/lib/exec.mjs';

const roots: string[] = [];
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

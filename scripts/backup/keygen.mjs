import { writeFile } from 'node:fs/promises';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { parseArgs, requireArgs, UsageError } from './lib/args.mjs';

try {
  const args = parseArgs(process.argv.slice(2), ['out']);
  requireArgs(args, ['out']);
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  await writeFile(args.out, `${identity}\n`, { flag: 'wx', mode: 0o600 });
  console.log(recipient);
} catch (error) {
  console.error(
    error instanceof UsageError
      ? 'Usage: backup:keygen --out <offline identity path>'
      : 'KEYGEN_FAILED (output must not already exist)',
  );
  process.exitCode = error instanceof UsageError ? 2 : 1;
}

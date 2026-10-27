import { expect, it } from 'vitest';
import { firstErrorLine, redact } from '../../scripts/backup/lib/redact.mjs';
import {
  parseArgs,
  requireArgs,
  UsageError,
} from '../../scripts/backup/lib/args.mjs';

it('redacts URLs, quoted passwords and identities', () => {
  const output = redact(
    'postgres://user:secret@host/db postgresql://other:secret@host/db password="two words" password=secret AGE-SECRET-KEY-1ABCDE',
  );
  for (const secret of ['secret', 'two words', '1ABCDE', 'host/db'])
    expect(output).not.toContain(secret);
  expect(redact('ordinary message')).toBe('ordinary message');
});
it('parses argument arrays with spaces and rejects malformed or duplicate flags', () => {
  expect(
    parseArgs(['--out', 'C:\\a b\\c', '--flag'], ['out'], ['flag']),
  ).toEqual({ out: 'C:\\a b\\c', flag: true });
  for (const args of [
    ['--out'],
    ['--unknown', 'x'],
    ['out', 'x'],
    ['--out', 'x', '--out', 'y'],
  ])
    expect(() => parseArgs(args, ['out'])).toThrow(UsageError);
  expect(() => requireArgs({}, ['out'])).toThrow(UsageError);
});

it('extracts only the first primary stderr error, including psql prefixes', () => {
  expect(
    firstErrorLine(
      'NOTICE: starting\r\npsql:<stdin>:12: ERROR: permission denied for parameter log_min_messages\r\nDETAIL: private row\r\nCONTEXT: COPY private_table\r\nFATAL: later error',
    ),
  ).toBe('ERROR: permission denied for parameter log_min_messages');
  expect(
    firstErrorLine('progress\nFATAL: database unavailable\nERROR: later'),
  ).toBe('FATAL: database unavailable');
  expect(
    firstErrorLine(
      'psql: error: connection failed\n  FATAL: connection refused',
    ),
  ).toBe('FATAL: connection refused');
});

it('redacts credentials and offending values in the extracted error', () => {
  const diagnostic = firstErrorLine(
    'ERROR: postgres://user:topsecret@host/db password="private words" AGE-SECRET-KEY-1ABC invalid value "row-secret" and \'another-secret\'\nDETAIL: do not print me',
  );
  expect(diagnostic).toBeDefined();
  for (const secret of [
    'topsecret',
    'private words',
    '1ABC',
    'row-secret',
    'another-secret',
    'do not print me',
  ]) {
    expect(diagnostic).not.toContain(secret);
  }
});

it('ignores SQL, data, and non-error lines instead of printing stderr wholesale', () => {
  expect(
    firstErrorLine(
      "COPY public.secret FROM stdin;\nDETAIL: secret\nCONTEXT: ERROR: secret\nINSERT INTO x VALUES ('ERROR: secret');",
    ),
  ).toBeUndefined();
  expect(firstErrorLine(undefined)).toBeUndefined();
  expect(firstErrorLine('')).toBeUndefined();
});

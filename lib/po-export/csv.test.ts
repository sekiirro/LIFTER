import { describe, expect, it } from 'vitest';
import { serializeCsv } from './csv';

describe('PO export CSV (T005)', () => {
  it('serializes exactly the supplied manifest fields in manifest order', () => {
    const csv = serializeCsv(
      [
        { key: 'name', type: 'text' },
        { key: 'amount', type: 'number' },
      ],
      [
        { name: 'Mona', amount: -1200, ignored: 'not exported' },
        { name: 'Omar', amount: 0, extra: 'not exported' },
      ],
    );

    expect(csv).toBe('name,amount\r\nMona,-1200\r\nOmar,0\r\n');
  });

  it('escapes quotes, commas, CRLF and embedded newlines as one CSV field', () => {
    const csv = serializeCsv(
      [{ key: 'value', type: 'text' }],
      [{ value: 'a,"b"\r\nc' }],
    );

    expect(csv).toBe('value\r\n"a,""b""\r\nc"\r\n');
  });

  it.each(['=1+1', '+SUM(A1:A2)', '-1+1', '@cmd', ' \t=1+1'])(
    'neutralizes formula-leading text %j',
    (value) => {
      const csv = serializeCsv(
        [{ key: 'value', type: 'text' }],
        [{ value }],
      );

      expect(csv).toBe(`value\r\n'${value}\r\n`);
    },
  );

  it('does not change negative numeric fields', () => {
    const csv = serializeCsv(
      [{ key: 'amount', type: 'number' }],
      [{ amount: -42 }],
    );

    expect(csv).toBe('amount\r\n-42\r\n');
  });

  it('writes a header for an empty result and rejects duplicate manifest keys', () => {
    expect(serializeCsv([{ key: 'name', type: 'text' }], [])).toBe(
      'name\r\n',
    );
    expect(() =>
      serializeCsv(
        [
          { key: 'name', type: 'text' },
          { key: 'name', type: 'text' },
        ],
        [],
      ),
    ).toThrow('Invalid PO export manifest');
  });
});

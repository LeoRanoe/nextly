import { describe, expect, it } from 'vitest';
import { type CsvColumn, csvCell, toCsv } from '@/lib/csv';

type Row = { value: string | number | null | undefined };

const VALUE_COLUMN: CsvColumn<Row>[] = [{ label: 'Value', value: (row) => row.value }];

describe('csvCell', () => {
  it('passes plain text through unquoted', () => {
    expect(csvCell('hello')).toBe('hello');
    expect(csvCell(42)).toBe('42');
  });

  it('quotes cells containing a separator, quote or newline and doubles embedded quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('tail\r\n')).toBe('"tail\r\n"');
  });

  it('renders null and undefined as empty cells', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('toCsv', () => {
  it('starts with a UTF-8 BOM and ends every line with CRLF', () => {
    const csv = toCsv([{ value: 'a' }, { value: 'b' }], VALUE_COLUMN);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toBe('\uFEFFValue\r\na\r\nb\r\n');
  });

  it('emits just the header for an empty result set', () => {
    expect(toCsv([], VALUE_COLUMN)).toBe('\uFEFFValue\r\n');
  });

  it('writes preamble lines as # comments before the header', () => {
    const csv = toCsv([{ value: 'x' }], VALUE_COLUMN, { preamble: ['filter: q=foo'] });
    expect(csv).toBe('\uFEFF#filter: q=foo\r\nValue\r\nx\r\n');
  });

  it('neutralises formula-injection prefixes in values and headers', () => {
    const rows = [
      { value: '=SUM(A1)' },
      { value: '+1' },
      { value: '@mention' },
      { value: '-40.00' },
    ];
    const csv = toCsv(rows, VALUE_COLUMN);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[1]).toBe("'=SUM(A1)");
    expect(lines[2]).toBe("'+1");
    expect(lines[3]).toBe("'@mention");
    // Negative money must stay numeric — '-' is deliberately not escaped.
    expect(lines[4]).toBe('-40.00');

    const quoted: CsvColumn<Row>[] = [{ label: '=HYPERLINK', value: () => '' }];
    expect(toCsv([{ value: '' }], quoted)).toBe("\uFEFF'=HYPERLINK\r\n\r\n");
  });
});

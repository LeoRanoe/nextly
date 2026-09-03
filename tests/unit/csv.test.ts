import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '@/lib/csv';

describe('CSV exports', () => {
  it('quotes commas, quotes, and line breaks safely', () => {
    expect(csvCell('ACME, "Wholesale"')).toBe('"ACME, ""Wholesale"""');
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
    expect(csvCell(null)).toBe('');
  });

  it('writes a BOM, CRLF-delimited document with a trailing newline', () => {
    const rows = [
      ['NX-1', 'ready'],
      ['NX-2', 'needs, review'],
    ];
    const columns = [
      { label: 'sku', value: (row: string[]) => row[0] },
      { label: 'note', value: (row: string[]) => row[1] },
    ];
    expect(toCsv(rows, columns)).toBe(
      '\uFEFFsku,note\r\nNX-1,ready\r\nNX-2,"needs, review"\r\n',
    );
  });

  it('neutralises spreadsheet formula cells', () => {
    expect(
      toCsv(
        [{ value: '=HYPERLINK("https://example.com")' }],
        [{ label: 'value', value: (row) => row.value }],
      ),
    ).toBe('\uFEFFvalue\r\n"\'=HYPERLINK(""https://example.com"")"\r\n');
  });
});

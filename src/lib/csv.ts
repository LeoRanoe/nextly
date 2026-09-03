/**
 * CSV serialisation (F-7).
 *
 * Shared by every export path so quoting and spreadsheet traps are fixed once.
 * Output is UTF-8 with a BOM and CRLF row endings: Excel on Windows otherwise
 * reads exported names incorrectly.
 */

export type CsvColumn<T> = {
  label: string;
  value: (row: T) => string | number | null | undefined;
};

/** RFC 4180 quoting: wrap when a cell contains a separator, quote, or newline. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

/** Keep spreadsheet applications from evaluating exported text as a formula. */
function neutralise(text: string): string {
  return /^[=+@]/.test(text) ? `'${text}` : text;
}

export function toCsv<T>(
  rows: T[],
  columns: CsvColumn<T>[],
  options: { preamble?: string[] } = {},
): string {
  const lines: string[] = [];
  for (const line of options.preamble ?? []) lines.push(`#${line}`);
  lines.push(columns.map((column) => csvCell(neutralise(column.label))).join(','));
  for (const row of rows) {
    lines.push(
      columns
        .map((column) => {
          const value = column.value(row);
          return csvCell(typeof value === 'string' ? neutralise(value) : value);
        })
        .join(','),
    );
  }
  return `\uFEFF${[...lines, ''].join('\r\n')}`;
}

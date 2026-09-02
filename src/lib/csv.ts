/**
 * CSV serialisation (F-7).
 *
 * Shared by every export path so quoting and the spreadsheet traps below can
 * only be fixed once. Output is UTF-8 with a BOM and CRLF row endings: Excel
 * on Windows otherwise reads exported names wrong, and this is an accountant-
 * facing file.
 */

export type CsvColumn<T> = {
  /** Header text. */
  label: string;
  value: (row: T) => string | number | null | undefined;
};

/** RFC 4180 quoting: wrap when the cell contains a separator, quote, or any
 *  newline; embedded quotes double. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/** A leading `=`/`+`/`@` is evaluated as a formula by Excel and Sheets.
 *  Prefixing a quote makes it literal text again — the standard mitigation.
 *  `-` deliberately stays unescaped: negative money renders as `-40.00` and
 *  must remain a number in the spreadsheet, while `-3` can never parse as a
 *  formula name anyway. */
function neutralise(text: string): string {
  return /^[=+@]/.test(text) ? `'${text}` : text;
}

export function toCsv<T>(
  rows: T[],
  columns: CsvColumn<T>[],
  options: { preamble?: string[] } = {},
): string {
  const lines: string[] = [];
  // Comment rows before the header carry context (which filter produced the
  // file) that belongs in the artefact, not in someone's memory. They start
  // with '#' because no spreadsheet importer treats that as data.
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
  // BOM first, then CRLF — see the header comment.
  return `﻿${[...lines, ''].join('\r\n')}`;
}

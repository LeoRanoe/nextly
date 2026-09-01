/**
 * Offset pagination, shared by every list query.
 *
 * Offset over cursor: these lists are hundreds of rows now and low
 * thousands in five years, and at that scale `OFFSET n` costs nothing.
 * Offset gives page numbers and a total the table footer wants to print;
 * cursor pagination cannot express "page 7 of 12" and needs a composite
 * cursor the moment a list sorts on more than one column. Revisit this if
 * any single list nears 100k rows — nothing before that.
 */

export const DEFAULT_PER_PAGE = 50;
export const MAX_PER_PAGE = 200;

export type Page<T> = {
  rows: T[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
};

/** Clamp a 1-based page number to something an OFFSET can use safely. */
export function clampPage(page: number | undefined): number {
  if (!page || !Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

/** Clamp a page size to (0, MAX_PER_PAGE], defaulting when absent or junk. */
export function clampPerPage(perPage: number | undefined): number {
  if (!perPage || !Number.isFinite(perPage) || perPage < 1) return DEFAULT_PER_PAGE;
  return Math.min(Math.floor(perPage), MAX_PER_PAGE);
}

/**
 * Assemble a `Page<T>` from rows that each already carry the query's total
 * row count (via `COUNT(*) OVER()`, aliased `total_count` in every list
 * query) — one round trip per page rather than a separate COUNT query, and
 * the count can never disagree with the rows since it comes from the same
 * scan.
 */
export function toPage<T>(rows: T[], total: number, page: number, perPage: number): Page<T> {
  const pageCount = total === 0 ? 1 : Math.ceil(total / perPage);
  return { rows, total, page, perPage, pageCount };
}

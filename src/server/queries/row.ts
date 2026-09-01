/**
 * Row coercion.
 *
 * `db.execute` hands back a loose record, and with `noUncheckedIndexedAccess`
 * every lookup is `string | null | undefined`. These three helpers turn that
 * into the exact type each read model promises, at the one boundary where the
 * database stops being typed. Everything downstream is honest.
 */

export function text(value: string | null | undefined, fallback = ''): string {
  return value ?? fallback;
}

/** For genuinely optional columns: a missing key and SQL NULL both mean null. */
export function maybe(value: string | null | undefined): string | null {
  return value ?? null;
}

/** Postgres returns bigint as a string to avoid precision loss in the driver;
 *  every money and count column arrives here. */
export function num(value: string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function bool(value: string | null | undefined): boolean {
  return value === 'true' || value === 't';
}

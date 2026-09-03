import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { serverEnv } from '@/lib/env';
import * as schema from './schema';

/**
 * Database client.
 *
 * Runtime traffic goes through the Supabase transaction pooler (port 6543),
 * which does not support prepared statements, hence `prepare: false`. Getting
 * this wrong produces intermittent "prepared statement already exists" errors
 * under concurrency rather than an obvious failure at startup.
 *
 * The client is built on FIRST USE, not at import. `next build` imports every
 * route module to collect page data, and a connection opened at module scope
 * would demand DATABASE_URL on a machine that is only compiling. The Proxy
 * keeps the ergonomics of a plain `db` value while deferring the work.
 *
 * The instance is cached on globalThis so Turbopack hot reloads in development
 * do not open a new pool on every edit.
 */

type Sql = ReturnType<typeof postgres>;
type Db = ReturnType<typeof createDb>;

declare global {
  var __nextlySql: Sql | undefined;
  var __nextlyDb: Db | undefined;
}

function createDb() {
  const { DATABASE_URL, NODE_ENV } = serverEnv();
  const sql =
    globalThis.__nextlySql ??
    postgres(DATABASE_URL, {
      prepare: false,
      // Vercel can run many function instances at once. A pool of ten per
      // instance overwhelms a small Supabase pooler and leaves requests
      // waiting for a lease until the platform's timeout. Keep the pool
      // deliberately small; the queries are short and the app has a handful
      // of concurrent users, not a long-lived application server.
      max: NODE_ENV === 'production' ? 2 : 4,
      idle_timeout: NODE_ENV === 'production' ? 5 : 20,
      connect_timeout: NODE_ENV === 'production' ? 5 : 10,
      max_lifetime: NODE_ENV === 'production' ? 300 : undefined,
      connection: {
        application_name: 'nextly',
        statement_timeout: NODE_ENV === 'production' ? 15_000 : 0,
        idle_in_transaction_session_timeout: NODE_ENV === 'production' ? 15_000 : 0,
      },
    });
  if (NODE_ENV !== 'production') globalThis.__nextlySql = sql;
  return drizzle(sql, { schema, casing: 'snake_case' });
}

function resolve(): Db {
  const existing = globalThis.__nextlyDb;
  if (existing) return existing;
  const created = createDb();
  globalThis.__nextlyDb = created;
  return created;
}

export const db = new Proxy({} as Db, {
  get(_target, property, receiver) {
    return Reflect.get(resolve() as object, property, receiver);
  },
  has(_target, property) {
    return Reflect.has(resolve() as object, property);
  },
});

export type Database = Db;
export { schema };

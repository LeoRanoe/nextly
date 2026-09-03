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
  var __nextlyTransactionSql: Sql | undefined;
  var __nextlyTransactionDb: Db | undefined;
}

function createConnectionOptions(
  nodeEnv: 'development' | 'test' | 'production',
  max: number,
  transactionSafe: boolean,
): Parameters<typeof postgres>[1] {
  const connectionOptions: Parameters<typeof postgres>[1] = {
    prepare: false,
    // Supabase's transaction pooler does not support the startup type
    // prefetch that postgres.js performs by default. Without this, the
    // first parameterised query can remain open in Supavisor and the page
    // waits until the platform timeout.
    fetch_types: false,
    // Vercel can run many function instances at once. A pool of ten per
    // instance can overwhelm a small Supabase pooler and leave requests
    // waiting for a lease until the platform's timeout. Keep the pool
    // deliberately small; the queries are short and the app has a handful
    // of concurrent users, not a long-lived application server.
    max,
    idle_timeout: nodeEnv === 'production' ? 5 : 20,
    connect_timeout: nodeEnv === 'production' ? 5 : 10,
    max_lifetime: nodeEnv === 'production' ? 300 : undefined,
    connection: {
      application_name: 'nextly',
      statement_timeout: nodeEnv === 'production' ? 15_000 : 0,
      idle_in_transaction_session_timeout: nodeEnv === 'production' ? 15_000 : 0,
    },
  };

  if (transactionSafe) {
    // `max_pipeline: 1` makes postgres.js reserve the single connection for
    // BEGIN/COMMIT while still allowing the transaction callback to queue
    // awaited statements safely.
    Object.assign(connectionOptions, { max_pipeline: 1 });
  } else if (nodeEnv === 'production') {
    // Supavisor transaction mode currently has an open issue around
    // pipelined transactions: when React starts several server queries at
    // once, a reply can be dropped and postgres.js waits forever. The read
    // pool therefore disables pipelining. Transactions use the separate
    // single-connection pool below; `max_pipeline: 0` cannot be used there
    // because postgres.js would skip reserving the connection for BEGIN.
    Object.assign(connectionOptions, { max_pipeline: 0 });
  }

  return connectionOptions;
}

function createDb() {
  const { DATABASE_URL, NODE_ENV } = serverEnv();
  const connectionOptions = createConnectionOptions(
    NODE_ENV,
    NODE_ENV === 'production' ? 2 : 4,
    false,
  );

  const sql = globalThis.__nextlySql ?? postgres(DATABASE_URL, connectionOptions);
  if (NODE_ENV !== 'production') globalThis.__nextlySql = sql;
  return drizzle(sql, { schema, casing: 'snake_case' });
}

function createTransactionDb() {
  const { DATABASE_URL, NODE_ENV } = serverEnv();
  const connectionOptions = createConnectionOptions(NODE_ENV, 1, true);
  const sql = globalThis.__nextlyTransactionSql ?? postgres(DATABASE_URL, connectionOptions);
  if (NODE_ENV !== 'production') globalThis.__nextlyTransactionSql = sql;
  return drizzle(sql, { schema, casing: 'snake_case' });
}

function resolve(): Db {
  const existing = globalThis.__nextlyDb;
  if (existing) return existing;
  const created = createDb();
  globalThis.__nextlyDb = created;
  return created;
}

function resolveTransaction(): Db {
  const existing = globalThis.__nextlyTransactionDb;
  if (existing) return existing;
  const created = createTransactionDb();
  globalThis.__nextlyTransactionDb = created;
  return created;
}

export const db = new Proxy({} as Db, {
  get(_target, property, receiver) {
    if (property === 'transaction') {
      const transactionDb = resolveTransaction();
      return transactionDb.transaction.bind(transactionDb);
    }
    return Reflect.get(resolve() as object, property, receiver);
  },
  has(_target, property) {
    return Reflect.has(resolve() as object, property);
  },
});

export type Database = Db;
export { schema };

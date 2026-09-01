import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Migrations run over the DIRECT connection (port 5432), not the transaction
 * pooler. DDL and advisory locks need a session, which pooled connections in
 * transaction mode cannot give.
 */
export default defineConfig({
  schema: './src/server/db/schema/index.ts',
  out: './src/server/db/migrations',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});

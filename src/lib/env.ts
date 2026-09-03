import { z } from 'zod';

/**
 * Environment access.
 *
 * Validation is lazy and memoised rather than run at module load. A build
 * should not fail because a deploy-time secret is absent from a developer
 * machine, but the first request that genuinely needs a secret should fail
 * loudly and say exactly which variable is missing.
 */

function isPoolerConnection(value: string, port: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'postgres:' || url.protocol === 'postgresql:') &&
      url.port === port &&
      url.hostname.endsWith('.pooler.supabase.com')
    );
  } catch {
    return false;
  }
}

const databaseUrlSchema = z
  .string()
  .url('DATABASE_URL must be a PostgreSQL connection URL')
  .refine(
    (value) => isPoolerConnection(value, '6543'),
    'DATABASE_URL must use the Supabase transaction pooler on port 6543',
  );

const directUrlSchema = z
  .string()
  .url('DIRECT_URL must be a PostgreSQL connection URL')
  .refine(
    (value) => isPoolerConnection(value, '5432'),
    'DIRECT_URL must use the Supabase session pooler on port 5432',
  );

const serverSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(32).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const migrationSchema = z.object({ DIRECT_URL: directUrlSchema });

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type PublicEnv = z.infer<typeof publicSchema>;

let serverCache: ServerEnv | undefined;
let publicCache: PublicEnv | undefined;

/**
 * An unset variable and a variable set to the empty string mean the same thing:
 * not configured. .env files cannot express `undefined`, so a placeholder line
 * like `DIRECT_URL=""` would otherwise fail an `.optional()` check and be far
 * more confusing than a missing line.
 */
function present(source: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && value.trim() !== '') out[key] = value;
  }
  return out;
}

function fail(scope: string, error: z.ZodError): never {
  const detail = error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `Invalid ${scope} environment. Copy .env.example to .env.local and fill in:\n${detail}`,
  );
}

export function serverEnv(): ServerEnv {
  if (serverCache) return serverCache;
  const parsed = serverSchema.safeParse(present(process.env));
  if (!parsed.success) fail('server', parsed.error);
  serverCache = parsed.data;
  return serverCache;
}

/** Non-throwing validation for setup and readiness screens. */
export function isServerEnvironmentValid(): boolean {
  return serverSchema.safeParse(present(process.env)).success;
}

/** Migration tooling uses the session pooler; the app itself does not. */
export function isMigrationEnvironmentValid(): boolean {
  return migrationSchema.safeParse(present({ DIRECT_URL: process.env.DIRECT_URL })).success;
}

export function publicEnv(): PublicEnv {
  if (publicCache) return publicCache;
  // Next inlines NEXT_PUBLIC_* at build time only when referenced statically,
  // so these must be spelled out rather than read off a dynamic key.
  const parsed = publicSchema.safeParse(
    present({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    }),
  );
  if (!parsed.success) fail('public', parsed.error);
  publicCache = parsed.data;
  return publicCache;
}

/** True once the database is reachable in this environment. Lets pages render
 *  a setup state instead of a stack trace before Supabase is provisioned. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

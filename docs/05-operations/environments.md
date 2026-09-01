# Environments and setup

---

## The Supabase project

Already created and migrated.

| | |
|---|---|
| Organisation | NextX Agency (`pkjqqsezqwowjcmeompc`), free plan |
| Project | **Nextly** |
| Reference | `jkaxfghplcwbxxhkjtwf` |
| Region | `us-east-1` |
| Postgres | 17 |
| Dashboard | https://supabase.com/dashboard/project/jkaxfghplcwbxxhkjtwf |

Schema, RLS policies, views and the Master Sheet import are all applied. Security
advisors return zero findings.

> The separate **Next-X Dashboard** project in the same organisation belongs to a
> different application. Nextly shares nothing with it.

---

## Local setup

### 1. Install

```bash
pnpm install
```

### 2. Fill in `.env.local`

`.env.local` already exists with the public values. Two secrets are missing,
both from
[Project settings → Database](https://supabase.com/dashboard/project/jkaxfghplcwbxxhkjtwf/settings/database).

Open **Connect** and copy two connection strings, replacing `[YOUR-PASSWORD]`
with the database password:

| Variable | Which string | Port |
|---|---|---|
| `DATABASE_URL` | **Transaction pooler** | 6543 |
| `DIRECT_URL` | **Session pooler** | 5432 |

> ### Use a pooler string, never the direct connection
>
> Both pooler strings have a host ending in **`pooler.supabase.com`**. The
> direct connection (`db.<ref>.supabase.co`) is **IPv6-only**, and Vercel's
> network is IPv4-only.
>
> The failure mode is nasty: it does not error, it **hangs**. The first deploy
> of this project died exactly this way, stalling for 54 seconds inside a build
> step before timing out with a message that pointed at caching rather than at
> the network.
>
> If a connection is silently hanging, check the host before anything else.

If nobody knows the database password, reset it on that page. Resetting it
breaks nothing else — this project has no other consumers.

**Why two.** Runtime traffic uses the transaction pooler, which is built for
short serverless connections but does not support prepared statements (hence
`prepare: false` in `src/server/db/client.ts`). Migrations need a real session
for DDL and advisory locks, so `drizzle-kit` uses the **session** pooler. Both
are Supavisor and both are IPv4.

### 3. Run

```bash
pnpm dev
```

Sign in at http://localhost:3000/login with **agencynextx@gmail.com**, which is
already seeded as an owner. Sign-in is email and password; the account itself
lives in Supabase Auth, so set or reset the password from
[Authentication → Users](https://supabase.com/dashboard/project/jkaxfghplcwbxxhkjtwf/auth/users).

Youri is seeded with the placeholder `youri@nextly.invalid`. Change it to his
real address in the database before he tries to sign in, or the invitation
cannot be claimed:

```sql
UPDATE members SET email = 'his@real.address' WHERE full_name = 'Youri';
```

### 4. Vercel Blob

Not yet provisioned. Create a Blob store in the Vercel project, then:

```bash
vercel env pull .env.local
```

Image upload is the only feature that needs it. See
[../04-engineering/media-pipeline.md](../04-engineering/media-pipeline.md) for
the two constraints that shape it.

---

## Commands

```bash
pnpm dev          # Turbopack dev server
pnpm build        # production build (stop dev first — see below)
pnpm typecheck    # tsc --noEmit
pnpm lint         # biome check
pnpm format       # biome check --write
pnpm test         # vitest: money, fx, cost accounting
pnpm db:generate  # SQL migration from the Drizzle schema
pnpm db:migrate   # apply migrations (uses DIRECT_URL)
pnpm db:studio    # browse the database
```

> **Stop `pnpm dev` before `pnpm build`.** Next 16 writes route types to both
> `.next/types` and `.next/dev/types`, `tsconfig.json` includes both, and two
> copies of the same global declarations conflict. The symptom is
> `"/products" is not assignable to type 'Route'` on routes that obviously
> exist. `rm -rf .next` clears it.

---

## Migrations

Authored with Drizzle, applied to Supabase.

```bash
pnpm db:generate --name=what_changed   # writes src/server/db/migrations/NNNN_*.sql
pnpm db:migrate                        # applies over DIRECT_URL
```

Hand-written SQL — RLS policies, views, functions — is scaffolded with
`pnpm drizzle-kit generate --custom --name=...` so it is journaled alongside the
generated files.

Applied so far:

| | |
|---|---|
| `0000_lame_famine` | 19 tables, 11 enums, foreign keys, indexes |
| `0001_rls_views_functions` | RLS on every table, five views, the `private` helper schema, gapless numbering |
| `0002_member_auth_link` | Split `members.id` from `auth_user_id` so owners can exist before signing in |
| `0003_ledger_sequence` | `seq bigserial` on both append-only ledgers, so the running balance is deterministic |

After any schema change, run the security advisor:

```
get_advisors(project_id: "jkaxfghplcwbxxhkjtwf", type: "security")
```

It should return an empty list. If it flags a `SECURITY DEFINER` function, that
function is in `public` and needs to move to `private` — see
[../01-architecture/security.md](../01-architecture/security.md).

---

## Deploying

Vercel, `iad1` (us-east-1), co-located with the database.

Environment variables to set in the Vercel project:

| Variable | Scope |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | all |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | all |
| `NEXT_PUBLIC_APP_URL` | per environment (production URL, preview URL) |
| `DATABASE_URL` | all |
| `DIRECT_URL` | all |
| `BLOB_READ_WRITE_TOKEN` | injected by the Blob integration |

**The build does not need the database.** Nothing is cached at build time, so
`next build` never opens a connection — a database problem can slow the app but
cannot fail a deploy. See [ADR-0006](../adr/0006-cache-components-and-tags.md).

To confirm that property still holds after a change:

```bash
DATABASE_URL="postgresql://u:p@203.0.113.9:6543/postgres" pnpm build
```

That address is reserved and unroutable. If the build completes, nothing in it
reached for Postgres.

Then add the deployed origin to Supabase's allowed redirect URLs
(Authentication → URL Configuration), or sign-in links will bounce.

---

## Backups

The free plan keeps daily backups with a short retention. Before anything
irreversible:

```bash
pg_dump "$DIRECT_URL" --no-owner --no-acl -f nextly-$(date +%F).sql
```

The books are append-only, so ordinary corrections are reversing entries rather
than edits, and there is little to restore *from* in normal operation. This
matters for schema changes, not for data entry.

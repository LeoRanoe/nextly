# Production readiness runbook

This document is the release gate for the small-business ERP. Code checks are
repeatable locally; database and hosting checks must be completed against an
isolated staging project before production data is migrated.

## Required environment

Set these in Vercel for Preview and Production, and keep the values out of git:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the
  browser Supabase client.
- `SUPABASE_SECRET_KEY` for server-only administrative operations such as
  invitations. Never expose it as a `NEXT_PUBLIC_*` variable.
- `DATABASE_URL` using the Supabase transaction pooler (port `6543`). Runtime
  traffic uses `prepare: false` for transaction-pooler compatibility.
- `DIRECT_URL` using the direct Supabase connection (port `5432`). Drizzle
  migrations must use this connection.
- `NEXT_PUBLIC_APP_URL` set to the final HTTPS origin. It is used in public
  invoice and quote links.
- `CRON_SECRET` set to a randomly generated value of at least 32 characters.
  The Monday reorder endpoint rejects missing, short, or incorrect secrets.
- `BLOB_READ_WRITE_TOKEN` when product images or receipt uploads are enabled.

Generate a secret with a password manager or a cryptographically secure random
generator; do not reuse a Supabase key.

## Migration and release sequence

1. Create or select an isolated Supabase staging project and enable database
   backups/PITR according to the chosen Supabase plan.
2. Fill staging `DATABASE_URL` and `DIRECT_URL` locally or in the CI secret
   store, then run `pnpm db:migrate`.
3. Run the reconciliation queries in `AUDIT.md` against staging. Confirm that
   no critical accounting, RLS, authorization, or migration findings remain.
4. Run `pnpm typecheck && pnpm lint && pnpm test && pnpm e2e && pnpm build`.
   The authenticated E2E suite requires a configured test user and test
   database; skipped setup is not evidence of a production pass.
5. Test the complete workflow in staging: receive an Amazon/AliExpress PO,
   allocate freight by weight, sell and return a bundle, publish an invoice,
   download CSV exports, and run the Monday reorder endpoint once.
6. Perform a restore drill from a staging backup into a separate project. Save
   the timestamp, backup identifier, migration result, and reconciliation
   output with the release record.
7. Apply the same migrations to production using production `DIRECT_URL`,
   deploy the commit, and verify the health path, sign-in, public documents,
   cron authorization, and dashboard warning states.

The application prepares draft purchase orders only. It never places an order
with Amazon or AliExpress automatically; a person must review and raise the PO
and then place the supplier order externally.

## Weekly reorder automation

`vercel.json` calls `/api/cron/reorder` every Monday at 12:00 UTC. That is
09:00 in the project timezone `America/Paramaribo`. The endpoint derives the
local Monday key, writes one idempotent recommendation snapshot, and does not
create or submit a purchase order. If the run fails, it records a failed run
and the dashboard exposes the warning for review.

## Operational controls

- Keep at least one owner account and one tested staff account in staging.
- Confirm viewer accounts can read but cannot mutate sales, purchases,
  bundles, settings, or team membership.
- Confirm public invoice/quote tokens are HTTPS, unguessable, revocable, and do
  not expose COGS, ledger data, or customer-private fields.
- Review Supabase RLS policies for every new table and confirm anon access is
  denied except for the intentionally public quote-request insert path.
- Monitor failed cron runs, database errors, storage errors, and deployment
  logs. Do not treat an empty dashboard as a healthy database.
- Schedule a recurring backup restore drill and retain the result with the
  accounting close records.

## Known release gate

Local typecheck, lint, unit tests, and production build can pass without a
database. The release is not operationally production-ready until real
staging credentials are supplied, migrations are applied there, RLS and
reconciliation queries pass, and the restore drill is evidenced.

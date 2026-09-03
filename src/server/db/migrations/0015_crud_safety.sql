-- CRUD safety: quote archival and append-only ledger reversal identity.
-- This migration is intentionally idempotent because the Drizzle snapshots in
-- this repository predate migrations 0007-0014.

DO $$
BEGIN
  ALTER TYPE public.quote_request_status ADD VALUE IF NOT EXISTS 'archived';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS reversal_of_id uuid;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS ledger_entries_reversal_key
  ON public.ledger_entries (reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

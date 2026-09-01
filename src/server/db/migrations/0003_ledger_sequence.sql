DROP INDEX "ledger_entries_occurred_idx";--> statement-breakpoint
DROP INDEX "inventory_movements_variant_idx";--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "seq" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "seq" bigserial NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_seq_key" ON "ledger_entries" USING btree ("seq");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_seq_key" ON "inventory_movements" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "ledger_entries_occurred_idx" ON "ledger_entries" USING btree ("occurred_at" DESC NULLS LAST,"seq" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "inventory_movements_variant_idx" ON "inventory_movements" USING btree ("variant_id","occurred_at" DESC NULLS LAST,"seq" DESC NULLS LAST);--> statement-breakpoint
-- The running balance now breaks ties on seq. Ordering on created_at could not
-- work: now() is the transaction timestamp, so entries posted together share it
-- exactly and the balance order fell through to a random uuid.
DROP VIEW IF EXISTS public.v_cash_ledger;--> statement-breakpoint
CREATE VIEW public.v_cash_ledger
WITH (security_invoker = true) AS
SELECT
  e.id, e.seq, e.occurred_at, e.created_at, e.direction, e.category, e.description,
  e.member_id, e.source_kind, e.source_id, e.payment_method, e.amount_usd_cents,
  CASE WHEN e.direction = 'in' THEN e.amount_usd_cents ELSE -e.amount_usd_cents END
    AS net_usd_cents,
  SUM(CASE WHEN e.direction = 'in' THEN e.amount_usd_cents ELSE -e.amount_usd_cents END)
    OVER (ORDER BY e.occurred_at, e.seq
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    AS balance_usd_cents
FROM public.ledger_entries e;--> statement-breakpoint

GRANT SELECT ON public.v_cash_ledger TO authenticated;

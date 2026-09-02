-- F-9 · Supplier payments (amounts owed on the buy side).
--
-- A purchase order used to post its payment only as a side effect of being
-- received, and the checkbox could be ticked off — which is exactly how PO-001
-- ended up $31.35 adrift while the cash balance asserted money that had left.
-- There was no record of what was actually paid to a supplier, so "how much do
-- we still owe?" had no answer.
--
-- `purchase_order_payments` mirrors `sale_payments` (0011) for the buy side:
-- append-only, each row posting its own `purchase` ledger entry tagged with the
-- payment's id (not the order's), so editing or cancelling an order cannot take
-- payments it did not create down with it. What has been paid is derived from
-- these rows; nothing here is stored on `purchase_orders`.
CREATE TABLE IF NOT EXISTS public.purchase_order_payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,

  -- In the currency of the order; the rate snapshot rides along so the payment
  -- converts exactly as the order would have.
  amount_cents      bigint NOT NULL CHECK (amount_cents > 0),
  currency          public.currency_code NOT NULL DEFAULT 'USD',
  fx_rate_micros    bigint NOT NULL DEFAULT 1000000 CHECK (fx_rate_micros > 0),

  method            public.payment_method NOT NULL DEFAULT 'card',
  paid_at           timestamptz NOT NULL DEFAULT now(),
  notes             text,

  member_id         uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_by_id     uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS po_payments_order_idx ON public.purchase_order_payments (purchase_order_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS po_payments_paid_idx  ON public.purchase_order_payments (paid_at DESC);--> statement-breakpoint

-- Same posture as every other table, enforced by the block in 0001: locked by
-- default, readable by any signed-in member. Append-only like `ledger_entries`
-- — INSERT gets a policy, UPDATE and DELETE deliberately do not, so a mistake
-- is corrected with another row rather than by editing history. Writes still go
-- through the server actions, which connect as postgres.
DO $$
BEGIN
  ALTER TABLE public.purchase_order_payments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.purchase_order_payments FORCE ROW LEVEL SECURITY;
  CREATE POLICY po_payments_select ON public.purchase_order_payments
    FOR SELECT TO authenticated USING (private.is_member());
  CREATE POLICY po_payments_insert ON public.purchase_order_payments
    FOR INSERT TO authenticated WITH CHECK (private.can_write());
END $$;

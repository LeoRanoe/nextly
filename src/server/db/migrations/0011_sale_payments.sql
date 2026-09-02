-- F-4 · Credit sales (accounts receivable).
--
-- A sale used to be draft or confirmed, and confirming posted the whole
-- receipt at once. There was no third state, so a deposit, a customer who
-- pays next week, or an answer to "who owes me?" were all impossible — while
-- the cash balance quietly asserted money that had not arrived.
--
-- `sale_payments` is the append-only record of money actually received. Each
-- row posts its own `sales_receipt` ledger entry tagged with the payment's id
-- (not the sale's), so a sale being edited or voided cannot take receipts it
-- did not create down with it. What has been paid is derived from these rows;
-- nothing here is stored on `sales`.
CREATE TABLE IF NOT EXISTS public.sale_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id        uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,

  -- In the currency of the sale; the rate snapshot rides along so the receipt
  -- converts exactly as the sale would have.
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  currency       public.currency_code NOT NULL DEFAULT 'USD',
  fx_rate_micros bigint NOT NULL DEFAULT 1000000 CHECK (fx_rate_micros > 0),

  method         public.payment_method NOT NULL DEFAULT 'cash',
  received_at    timestamptz NOT NULL DEFAULT now(),
  notes          text,

  member_id      uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_by_id  uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS sale_payments_sale_idx     ON public.sale_payments (sale_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sale_payments_received_idx ON public.sale_payments (received_at DESC);--> statement-breakpoint

-- Same posture as every other table, enforced by the block in 0001: locked by
-- default, readable by any signed-in member. Append-only like `ledger_entries`
-- — INSERT gets a policy, UPDATE and DELETE deliberately do not, so a mistake
-- is corrected with another row rather than by editing history. Writes still go
-- through the server actions, which connect as postgres.
DO $$
BEGIN
  ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.sale_payments FORCE ROW LEVEL SECURITY;
  CREATE POLICY sale_payments_select ON public.sale_payments
    FOR SELECT TO authenticated USING (private.is_member());
  CREATE POLICY sale_payments_insert ON public.sale_payments
    FOR INSERT TO authenticated WITH CHECK (private.can_write());
END $$;

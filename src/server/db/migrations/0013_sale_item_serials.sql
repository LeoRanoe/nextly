-- F-6 · Serial numbers and warranty tracking.
--
-- A customer arrives holding a device with a number printed on it. Without a
-- place for that number, the books cannot answer the only two questions that
-- matter: who bought this, and is it still under warranty. Serials are
-- captured optionally at the point of sale — most items never get one — and
-- warranty expiry is derived from the sale's sold_at plus the product's term,
-- never stored, so changing the term today cannot rewrite what was promised
-- then.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS warranty_months integer NOT NULL DEFAULT 0
  CHECK (warranty_months >= 0);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.sale_item_serials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Cascade from sale_items, not from sales: voiding a sale keeps its lines as
  -- history, and so keeps their serials. Editing a draft replaces the lines,
  -- which replaces the serials along with them.
  sale_item_id  uuid NOT NULL REFERENCES public.sale_items(id) ON DELETE CASCADE,
  serial        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS sale_item_serials_item_idx   ON public.sale_item_serials (sale_item_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sale_item_serials_serial_idx ON public.sale_item_serials (serial);--> statement-breakpoint

DO $$
BEGIN
  ALTER TABLE public.sale_item_serials ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.sale_item_serials FORCE ROW LEVEL SECURITY;
  CREATE POLICY sale_item_serials_select ON public.sale_item_serials
    FOR SELECT TO authenticated USING (private.is_member());
  CREATE POLICY sale_item_serials_insert ON public.sale_item_serials
    FOR INSERT TO authenticated WITH CHECK (private.can_write());
END $$;--> statement-breakpoint

-- products.warranty_months rides on the existing products_touch_updated_at
-- trigger, so no new trigger is needed here.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_warranty_months_check;--> statement-breakpoint
ALTER TABLE public.products ADD CONSTRAINT products_warranty_months_check
  CHECK (warranty_months >= 0);

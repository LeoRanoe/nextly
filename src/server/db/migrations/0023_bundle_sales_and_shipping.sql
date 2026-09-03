ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS is_strategic boolean NOT NULL DEFAULT false;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS public_token_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS sales_public_token_key ON public.sales(public_token_hash);

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS shipping_overhead_cents bigint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS sales_status_sold_at_idx
  ON public.sales (status, sold_at DESC);

ALTER TABLE public.reorder_recommendations
  ADD COLUMN IF NOT EXISTS strategic_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supporting_for text,
  ADD COLUMN IF NOT EXISTS weight_grams integer NOT NULL DEFAULT 0;

UPDATE public.product_variants SET weight_grams = 0 WHERE weight_grams < 0;
UPDATE public.purchase_order_items SET weight_grams = 0 WHERE weight_grams < 0;
UPDATE public.bundle_components SET weight_grams = 0 WHERE weight_grams < 0;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS bundle_id uuid REFERENCES public.bundles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bundle_name text,
  ADD COLUMN IF NOT EXISTS bundle_sku text;

CREATE INDEX IF NOT EXISTS sale_items_bundle_idx ON public.sale_items(bundle_id);

CREATE TABLE IF NOT EXISTS public.sale_item_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_item_id uuid NOT NULL REFERENCES public.sale_items(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  quantity_per_bundle integer NOT NULL CHECK (quantity_per_bundle > 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  product_name text NOT NULL,
  variant_name text NOT NULL,
  sku text NOT NULL,
  weight_grams integer NOT NULL DEFAULT 0 CHECK (weight_grams >= 0),
  cogs_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sale_item_components_line_idx ON public.sale_item_components(sale_item_id);
CREATE INDEX IF NOT EXISTS sale_item_components_variant_idx ON public.sale_item_components(variant_id);

DO $$
BEGIN
  ALTER TABLE public.product_variants
    ADD CONSTRAINT product_variants_weight_nonnegative CHECK (weight_grams >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_weight_nonnegative CHECK (weight_grams >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE public.bundle_components
    ADD CONSTRAINT bundle_components_weight_nonnegative CHECK (weight_grams >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.sale_item_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_item_components FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sale_item_components_select ON public.sale_item_components;
DROP POLICY IF EXISTS sale_item_components_insert ON public.sale_item_components;
CREATE POLICY sale_item_components_select ON public.sale_item_components FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY sale_item_components_insert ON public.sale_item_components FOR INSERT TO authenticated WITH CHECK (private.can_write());

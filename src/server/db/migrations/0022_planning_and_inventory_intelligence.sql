ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS weekly_purchase_budget_cents bigint,
  ADD COLUMN IF NOT EXISTS review_horizon_days bigint NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS safety_stock_days bigint NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS default_supplier_lead_time_days bigint NOT NULL DEFAULT 28,
  ADD COLUMN IF NOT EXISTS target_bundle_margin_bp bigint NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS default_bundle_discount_bp bigint NOT NULL DEFAULT 500;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS lead_time_days integer NOT NULL DEFAULT 28;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS weight_grams integer NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS weight_grams integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.reorder_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS reorder_runs_date_key ON public.reorder_runs(run_date);
CREATE INDEX IF NOT EXISTS reorder_runs_created_idx ON public.reorder_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS public.reorder_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.reorder_runs(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  units_sold_90d integer NOT NULL DEFAULT 0,
  gross_profit_cents_90d bigint NOT NULL DEFAULT 0,
  revenue_cents_90d bigint NOT NULL DEFAULT 0,
  on_hand integer NOT NULL DEFAULT 0,
  inbound integer NOT NULL DEFAULT 0,
  landed_unit_cost_cents bigint NOT NULL DEFAULT 0,
  daily_demand numeric NOT NULL DEFAULT 0,
  days_of_cover numeric,
  recommended_qty integer NOT NULL DEFAULT 0,
  budget_qty integer NOT NULL DEFAULT 0,
  deferred_qty integer NOT NULL DEFAULT 0,
  score numeric NOT NULL DEFAULT 0,
  reasons text[] NOT NULL DEFAULT '{}',
  low_confidence boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reorder_recommendations_run_idx ON public.reorder_recommendations(run_id);
CREATE INDEX IF NOT EXISTS reorder_recommendations_variant_idx ON public.reorder_recommendations(variant_id);

CREATE TABLE IF NOT EXISTS public.bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  name text NOT NULL,
  description text,
  price_cents bigint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bundles_sku_key ON public.bundles(sku);
CREATE INDEX IF NOT EXISTS bundles_active_idx ON public.bundles(is_active);

CREATE TABLE IF NOT EXISTS public.bundle_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES public.bundles(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1,
  product_name text NOT NULL,
  variant_name text NOT NULL,
  sku text NOT NULL,
  weight_grams integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS bundle_components_unique ON public.bundle_components(bundle_id, variant_id);
CREATE INDEX IF NOT EXISTS bundle_components_bundle_idx ON public.bundle_components(bundle_id, position);

ALTER TABLE public.reorder_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reorder_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reorder_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reorder_recommendations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_components FORCE ROW LEVEL SECURITY;

CREATE POLICY reorder_runs_select ON public.reorder_runs FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY reorder_runs_insert ON public.reorder_runs FOR INSERT TO authenticated WITH CHECK (private.can_write());
CREATE POLICY reorder_recommendations_select ON public.reorder_recommendations FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY reorder_recommendations_insert ON public.reorder_recommendations FOR INSERT TO authenticated WITH CHECK (private.can_write());
CREATE POLICY bundles_select ON public.bundles FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY bundles_insert ON public.bundles FOR INSERT TO authenticated WITH CHECK (private.can_write());
CREATE POLICY bundles_update ON public.bundles FOR UPDATE TO authenticated USING (private.can_write()) WITH CHECK (private.can_write());
CREATE POLICY bundle_components_select ON public.bundle_components FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY bundle_components_insert ON public.bundle_components FOR INSERT TO authenticated WITH CHECK (private.can_write());
CREATE POLICY bundle_components_update ON public.bundle_components FOR UPDATE TO authenticated USING (private.can_write()) WITH CHECK (private.can_write());

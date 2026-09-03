-- Commercial documents: customer quotes and stable invoice metadata.
DO $$ BEGIN
  CREATE TYPE public.quote_status AS ENUM ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'converted', 'void');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS quote_validity_days bigint NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS default_payment_days bigint NOT NULL DEFAULT 14;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS sales_invoice_number_key
  ON public.sales (invoice_number);

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS due_at timestamptz;

INSERT INTO public.document_sequences (prefix, last_value, padding)
VALUES ('INV-', 0, 3), ('QT-', 0, 3)
ON CONFLICT (prefix) DO NOTHING;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY sold_at, created_at, id) AS n
  FROM public.sales
  WHERE status = 'confirmed' AND invoice_number IS NULL
)
UPDATE public.sales s
SET invoice_number = 'INV-' || LPAD(numbered.n::text, 3, '0')
FROM numbered
WHERE s.id = numbered.id;

UPDATE public.document_sequences seq
SET last_value = GREATEST(seq.last_value, COALESCE((
  SELECT MAX((regexp_match(invoice_number, '[0-9]+$'))[1]::bigint)
  FROM public.sales WHERE invoice_number IS NOT NULL
), 0)), updated_at = now()
WHERE seq.prefix = 'INV-';

CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status public.quote_status NOT NULL DEFAULT 'draft',
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_contact text,
  request_id uuid REFERENCES public.quote_requests(id) ON DELETE SET NULL,
  supersedes_id uuid,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  fx_rate_micros bigint NOT NULL DEFAULT 1000000,
  subtotal_cents bigint NOT NULL DEFAULT 0,
  discount_cents bigint NOT NULL DEFAULT 0,
  total_cents bigint NOT NULL DEFAULT 0,
  valid_until timestamptz NOT NULL,
  public_token_hash text,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  converted_sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  notes text,
  created_by_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  variant_name text,
  sku text,
  quantity integer NOT NULL,
  unit_price_cents bigint NOT NULL,
  line_total_cents bigint NOT NULL,
  position integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS quotes_number_version_key ON public.quotes(number, version);
CREATE UNIQUE INDEX IF NOT EXISTS quotes_public_token_key ON public.quotes(public_token_hash);
CREATE INDEX IF NOT EXISTS quotes_status_idx ON public.quotes(status, created_at DESC);
CREATE INDEX IF NOT EXISTS quotes_customer_idx ON public.quotes(customer_id);
CREATE INDEX IF NOT EXISTS quotes_request_idx ON public.quotes(request_id);
CREATE INDEX IF NOT EXISTS quote_items_quote_idx ON public.quote_items(quote_id, position);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotes_select ON public.quotes;
DROP POLICY IF EXISTS quotes_insert ON public.quotes;
DROP POLICY IF EXISTS quotes_update ON public.quotes;
CREATE POLICY quotes_select ON public.quotes FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY quotes_insert ON public.quotes FOR INSERT TO authenticated WITH CHECK (private.can_write());
CREATE POLICY quotes_update ON public.quotes FOR UPDATE TO authenticated USING (private.can_write()) WITH CHECK (private.can_write());

DROP POLICY IF EXISTS quote_items_select ON public.quote_items;
DROP POLICY IF EXISTS quote_items_insert ON public.quote_items;
DROP POLICY IF EXISTS quote_items_update ON public.quote_items;
CREATE POLICY quote_items_select ON public.quote_items FOR SELECT TO authenticated USING (private.is_member());
CREATE POLICY quote_items_insert ON public.quote_items FOR INSERT TO authenticated WITH CHECK (private.can_write());
CREATE POLICY quote_items_update ON public.quote_items FOR UPDATE TO authenticated USING (private.can_write()) WITH CHECK (private.can_write());

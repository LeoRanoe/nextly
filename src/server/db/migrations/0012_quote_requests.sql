-- F-5 · Quote requests from the storefront.
--
-- The public pages could only wave at a WhatsApp number. This is demand
-- capture that lands inside the books: a visitor asks what something costs,
-- the request appears in the admin, and converting it seeds a draft sale —
-- reusing the whole existing sales flow rather than inventing a checkout.
--
-- Writes go through the server actions (the postgres role), which bypass RLS;
-- nothing grants `anon` here, so the browser's published key cannot read or
-- spam this table over REST. Same posture as 0011 for sale_payments.
DO $$
BEGIN
  CREATE TYPE public.quote_request_status AS ENUM ('new', 'contacted', 'converted', 'declined');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.quote_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  -- One field, not a phone column and an email column: the storefront asks for
  -- "phone or email", and forcing a visitor to pick the wrong one is worse than
  -- storing a string the owner reads. Nothing here is parsed as an address.
  contact       text NOT NULL,
  -- A request names a product, never a colourway — visitors read variants as
  -- choices on one item. Which variant was actually quoted lands on the sale.
  -- RESTRICT: a request that led to a quote is history and must survive the
  -- catalog changing under it. Deleting such a product must be archived first.
  product_id    uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity      integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  details       text,
  status        public.quote_request_status NOT NULL DEFAULT 'new',
  -- Set when an owner converts the request into a draft sale. Not a cascade
  -- path: the request is evidence of where the sale came from.
  sale_id       uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  handled_by_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS quote_requests_status_idx  ON public.quote_requests (status, created_at DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS quote_requests_product_idx ON public.quote_requests (product_id);--> statement-breakpoint

DO $$
BEGIN
  ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.quote_requests FORCE ROW LEVEL SECURITY;
  CREATE POLICY quote_requests_select ON public.quote_requests
    FOR SELECT TO authenticated USING (private.is_member());
  CREATE POLICY quote_requests_insert ON public.quote_requests
    FOR INSERT TO authenticated WITH CHECK (private.can_write());
  CREATE POLICY quote_requests_update ON public.quote_requests
    FOR UPDATE TO authenticated
      USING (private.can_write()) WITH CHECK (private.can_write());
END $$;--> statement-breakpoint

CREATE OR REPLACE TRIGGER quote_requests_touch_updated_at BEFORE UPDATE ON public.quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

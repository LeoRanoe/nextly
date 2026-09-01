-- ============================================================================
-- Nextly: access control, derived read models, and helper functions.
--
-- Three things happen here that the Drizzle schema cannot express:
--   1. Row Level Security, so authorisation is enforced by Postgres rather
--      than trusted to every call site in the application.
--   2. Views for the numbers that are always derived and never stored:
--      stock on hand, running cash balance, owner equity, product margin.
--   3. Gapless document numbering and updated_at triggers.
-- ============================================================================


-- ─── Helpers ────────────────────────────────────────────────────────────────
-- These live in `private`, NOT `public`, and that placement is the whole point.
-- PostgREST exposes every function in `public` as /rest/v1/rpc/<name>. A
-- SECURITY DEFINER helper sitting there is callable over HTTP by anyone with
-- an anon key: next_document_number in particular would let a signed-in user
-- burn purchase order numbers at will. Policies can reference any schema, so
-- moving them out costs nothing and closes the hole.
--
-- SECURITY DEFINER with an empty search_path: these are called from inside the
-- RLS policy on `members` itself, so they must not re-enter RLS, and they must
-- not be hijackable by a caller-controlled search_path.

CREATE SCHEMA IF NOT EXISTS private;--> statement-breakpoint
GRANT USAGE ON SCHEMA private TO authenticated;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.is_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.members m WHERE m.id = (SELECT auth.uid())); $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.member_role()
RETURNS public.member_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT m.role FROM public.members m WHERE m.id = (SELECT auth.uid()); $$;--> statement-breakpoint

-- Can this caller change data? Viewers read; staff and owners write.
CREATE OR REPLACE FUNCTION private.can_write()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT COALESCE(private.member_role() IN ('owner', 'staff'), false); $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT COALESCE(private.member_role() = 'owner', false); $$;--> statement-breakpoint


-- ─── Gapless document numbering ─────────────────────────────────────────────
-- A Postgres SEQUENCE is deliberately not used. Sequences are non-transactional
-- and leave holes when a transaction rolls back; a purchase order series with
-- gaps is the first thing anyone auditing the books asks about. This bumps the
-- counter inside the caller's transaction, so a rollback un-bumps it.

CREATE OR REPLACE FUNCTION private.next_document_number(p_prefix text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_next    bigint;
  v_padding bigint;
BEGIN
  INSERT INTO public.document_sequences AS s (prefix, last_value)
       VALUES (p_prefix, 1)
  ON CONFLICT (prefix) DO UPDATE
          SET last_value = s.last_value + 1, updated_at = now()
    RETURNING s.last_value, s.padding INTO v_next, v_padding;
  RETURN p_prefix || lpad(v_next::text, v_padding::int, '0');
END;
$$;--> statement-breakpoint

-- Policy expressions evaluate with the querying role's privileges, so the
-- signed-in role still needs EXECUTE. It simply cannot reach these over HTTP.
GRANT EXECUTE ON FUNCTION
  private.is_member(), private.member_role(), private.can_write(),
  private.is_owner(), private.next_document_number(text)
TO authenticated;--> statement-breakpoint


-- ─── updated_at ─────────────────────────────────────────────────────────────
-- Returns `trigger`, so PostgREST will not expose it as an RPC endpoint.

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'members', 'settings', 'products', 'product_variants', 'customers',
    'purchase_orders', 'sales', 'expenses'
  ] LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER %I BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  END LOOP;
END $$;--> statement-breakpoint


-- ─── Row Level Security ─────────────────────────────────────────────────────
-- Every table is locked by default. Absence of a policy denies the action, so
-- the append-only tables simply have no UPDATE or DELETE policy: corrections
-- are made with a reversing entry, never by editing history.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'members', 'settings', 'document_sequences', 'activity_logs',
    'categories', 'suppliers', 'products', 'product_variants', 'product_images',
    'customers', 'purchase_orders', 'purchase_order_items',
    'inventory_movements', 'sales', 'sale_items',
    'fx_rates', 'expense_categories', 'expenses', 'ledger_entries'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    -- Read: any signed-in member sees everything. Nextly is one business with
    -- a handful of trusted staff, not a multi-tenant SaaS.
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.is_member())',
      t || '_select', t
    );
  END LOOP;

  -- Write: owners and staff, on the mutable tables. Delete: owners only.
  FOREACH t IN ARRAY ARRAY[
    'categories', 'suppliers', 'products', 'product_variants', 'product_images',
    'customers', 'purchase_orders', 'purchase_order_items',
    'sales', 'sale_items', 'fx_rates', 'expense_categories', 'expenses'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.can_write())',
      t || '_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (private.can_write()) WITH CHECK (private.can_write())',
      t || '_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (private.is_owner())',
      t || '_delete', t
    );
  END LOOP;

  -- Append-only: insert permitted, update and delete have no policy and are
  -- therefore refused to everyone.
  FOREACH t IN ARRAY ARRAY['inventory_movements', 'ledger_entries', 'activity_logs'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.can_write())',
      t || '_insert', t
    );
  END LOOP;
END $$;--> statement-breakpoint

-- Members and settings are owner-administered. A member may edit their own row.
CREATE POLICY members_update_self ON public.members
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR private.is_owner())
  WITH CHECK (id = (SELECT auth.uid()) OR private.is_owner());--> statement-breakpoint

CREATE POLICY members_insert_owner ON public.members
  FOR INSERT TO authenticated WITH CHECK (private.is_owner());--> statement-breakpoint

CREATE POLICY members_delete_owner ON public.members
  FOR DELETE TO authenticated USING (private.is_owner());--> statement-breakpoint

CREATE POLICY settings_update_owner ON public.settings
  FOR UPDATE TO authenticated
  USING (private.is_owner()) WITH CHECK (private.is_owner());--> statement-breakpoint

CREATE POLICY document_sequences_write ON public.document_sequences
  FOR ALL TO authenticated
  USING (private.can_write()) WITH CHECK (private.can_write());--> statement-breakpoint


-- ─── Derived read models ────────────────────────────────────────────────────
-- security_invoker so the caller's RLS applies. Without it a view runs as its
-- owner and quietly becomes a hole straight through row level security.

-- Stock on hand is the sum of the movement ledger, never a stored counter.
CREATE OR REPLACE VIEW public.v_stock_levels
WITH (security_invoker = true) AS
SELECT
  v.id                                        AS variant_id,
  v.product_id,
  v.sku,
  v.name                                      AS variant_name,
  p.name                                      AS product_name,
  p.code                                      AS product_code,
  COALESCE(SUM(m.quantity), 0)::bigint        AS on_hand,
  COALESCE(SUM(m.value_cents), 0)::bigint     AS value_cents,
  COALESCE(SUM(m.quantity) FILTER (WHERE m.kind = 'receipt'), 0)::bigint AS total_received,
  COALESCE(-SUM(m.quantity) FILTER (WHERE m.kind = 'sale'), 0)::bigint   AS total_sold,
  MAX(m.occurred_at)                          AS last_movement_at
FROM public.product_variants v
JOIN public.products p            ON p.id = v.product_id
LEFT JOIN public.inventory_movements m ON m.variant_id = v.id
GROUP BY v.id, v.product_id, v.sku, v.name, p.name, p.code;--> statement-breakpoint

-- Running cash balance. Computed, so it cannot go stale or disagree with the
-- entries above it.
CREATE OR REPLACE VIEW public.v_cash_ledger
WITH (security_invoker = true) AS
SELECT
  e.id, e.occurred_at, e.created_at, e.direction, e.category, e.description,
  e.member_id, e.source_kind, e.source_id, e.payment_method, e.amount_usd_cents,
  CASE WHEN e.direction = 'in' THEN e.amount_usd_cents ELSE -e.amount_usd_cents END
    AS net_usd_cents,
  SUM(CASE WHEN e.direction = 'in' THEN e.amount_usd_cents ELSE -e.amount_usd_cents END)
    OVER (ORDER BY e.occurred_at, e.created_at, e.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    AS balance_usd_cents
FROM public.ledger_entries e;--> statement-breakpoint

CREATE OR REPLACE VIEW public.v_owner_equity
WITH (security_invoker = true) AS
SELECT
  m.id AS member_id,
  m.full_name,
  COALESCE(SUM(e.amount_usd_cents) FILTER
    (WHERE e.category = 'owner_contribution'), 0)::bigint AS contributed_cents,
  COALESCE(SUM(e.amount_usd_cents) FILTER
    (WHERE e.category = 'owner_draw'), 0)::bigint         AS drawn_cents,
  COALESCE(SUM(
    CASE e.category
      WHEN 'owner_contribution' THEN e.amount_usd_cents
      WHEN 'owner_draw'         THEN -e.amount_usd_cents
      ELSE 0
    END), 0)::bigint                                      AS net_cents
FROM public.members m
LEFT JOIN public.ledger_entries e ON e.member_id = m.id
WHERE m.is_principal
GROUP BY m.id, m.full_name;--> statement-breakpoint

-- Margin per product, on real landed cost. Only confirmed sales count.
CREATE OR REPLACE VIEW public.v_product_margins
WITH (security_invoker = true) AS
SELECT
  p.id AS product_id, p.code, p.name,
  COALESCE(SUM(si.quantity), 0)::bigint             AS units_sold,
  COALESCE(SUM(si.line_total_usd_cents), 0)::bigint AS revenue_cents,
  COALESCE(SUM(si.cogs_cents), 0)::bigint           AS cogs_cents,
  COALESCE(SUM(si.line_total_usd_cents - si.cogs_cents), 0)::bigint AS gross_cents
FROM public.products p
JOIN public.product_variants v ON v.product_id = p.id
LEFT JOIN public.sale_items si
       ON si.variant_id = v.id
      AND EXISTS (
            SELECT 1 FROM public.sales s
             WHERE s.id = si.sale_id AND s.status = 'confirmed'
          )
GROUP BY p.id, p.code, p.name;--> statement-breakpoint

-- What each customer is worth, replacing the two self-maintaining columns on
-- the spreadsheet's Klanten tab.
CREATE OR REPLACE VIEW public.v_customer_totals
WITH (security_invoker = true) AS
SELECT
  c.id AS customer_id, c.code, c.name,
  COUNT(s.id) FILTER (WHERE s.status = 'confirmed')::bigint AS order_count,
  COALESCE(SUM(s.total_usd_cents) FILTER
    (WHERE s.status = 'confirmed'), 0)::bigint              AS spent_usd_cents,
  COALESCE(SUM(s.gross_profit_cents) FILTER
    (WHERE s.status = 'confirmed'), 0)::bigint              AS gross_profit_cents,
  MAX(s.sold_at) FILTER (WHERE s.status = 'confirmed')      AS last_order_at
FROM public.customers c
LEFT JOIN public.sales s ON s.customer_id = c.id
GROUP BY c.id, c.code, c.name;--> statement-breakpoint

GRANT SELECT ON
  public.v_stock_levels,
  public.v_cash_ledger,
  public.v_owner_equity,
  public.v_product_margins,
  public.v_customer_totals
TO authenticated;

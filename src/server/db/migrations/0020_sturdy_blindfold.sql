CREATE TABLE "reconciliation_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_key" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"description" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution_notes" text,
	"resolved_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reconciliation_exceptions" ADD CONSTRAINT "reconciliation_exceptions_resolved_by_id_members_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_exception_key" ON "reconciliation_exceptions" USING btree ("kind","entity_type","entity_key","status");--> statement-breakpoint
CREATE INDEX "reconciliation_exception_status_idx" ON "reconciliation_exceptions" USING btree ("status","detected_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reconciliation_exception_resolved_by_idx" ON "reconciliation_exceptions" USING btree ("resolved_by_id");
--> statement-breakpoint
ALTER TABLE public.reconciliation_exceptions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.reconciliation_exceptions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS reconciliation_exceptions_select ON public.reconciliation_exceptions;--> statement-breakpoint
DROP POLICY IF EXISTS reconciliation_exceptions_insert ON public.reconciliation_exceptions;--> statement-breakpoint
CREATE POLICY reconciliation_exceptions_select ON public.reconciliation_exceptions
  FOR SELECT TO authenticated USING (private.is_member());--> statement-breakpoint
CREATE POLICY reconciliation_exceptions_insert ON public.reconciliation_exceptions
  FOR INSERT TO authenticated WITH CHECK (private.can_write());--> statement-breakpoint

-- Record only exceptions that are discoverable from existing production rows.
-- These inserts preserve history and create no receipts, payments, or stock.
INSERT INTO public.reconciliation_exceptions
  (kind, entity_type, entity_key, severity, description)
SELECT
  'unlinked_sale_receipt', 'sale', s.number, 'critical',
  'Confirmed sale has no traceable sales receipt; reconcile the original payment without inventing one.'
FROM public.sales s
WHERE s.status = 'confirmed'
  AND NOT EXISTS (
    SELECT 1 FROM public.ledger_entries l
    WHERE l.source_kind = 'sale' AND l.source_id = s.id AND l.category = 'sales_receipt'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.sale_payments sp
    JOIN public.ledger_entries l
      ON l.source_kind = 'sale' AND l.source_id = sp.id AND l.category = 'sales_receipt'
    WHERE sp.sale_id = s.id
  )
ON CONFLICT (kind, entity_type, entity_key, status) DO NOTHING;--> statement-breakpoint

INSERT INTO public.reconciliation_exceptions
  (kind, entity_type, entity_key, severity, description)
SELECT
  'unpaid_received_order', 'purchase_order', p.number, 'critical',
  'Received purchase order has no traceable supplier payment; reconcile the original payment without inventing one.'
FROM public.purchase_orders p
WHERE p.status = 'received'
  AND NOT EXISTS (
    SELECT 1 FROM public.ledger_entries l
    WHERE l.source_kind = 'purchase_order' AND l.source_id = p.id AND l.category = 'purchase'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.purchase_order_payments pp
    JOIN public.ledger_entries l
      ON l.source_kind = 'purchase_order' AND l.source_id = pp.id AND l.category = 'purchase'
    WHERE pp.purchase_order_id = p.id
  )
ON CONFLICT (kind, entity_type, entity_key, status) DO NOTHING;--> statement-breakpoint

INSERT INTO public.reconciliation_exceptions
  (kind, entity_type, entity_key, severity, description)
SELECT
  'negative_stock', 'product_variant', v.sku, 'critical',
  'Stock is below zero; identify the missing receipt or duplicate sale before correcting inventory.'
FROM public.v_stock_levels v
WHERE v.on_hand < 0
ON CONFLICT (kind, entity_type, entity_key, status) DO NOTHING;--> statement-breakpoint

INSERT INTO public.reconciliation_exceptions
  (kind, entity_type, entity_key, severity, description)
SELECT
  'future_dated_sale', 'sale', s.number, 'warning',
  'Sale is dated after the migration audit time; confirm the intended business date.'
FROM public.sales s
WHERE s.sold_at > now()
ON CONFLICT (kind, entity_type, entity_key, status) DO NOTHING;--> statement-breakpoint

INSERT INTO public.reconciliation_exceptions
  (kind, entity_type, entity_key, severity, description)
SELECT
  'legacy_manual_ledger', 'ledger', l.id::text, 'info',
  'Legacy manual ledger entry predates document-linked payment workflows; verify its source and classification.'
FROM public.ledger_entries l
WHERE l.source_kind = 'manual'
ON CONFLICT (kind, entity_type, entity_key, status) DO NOTHING;

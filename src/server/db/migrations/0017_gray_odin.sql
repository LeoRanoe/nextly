CREATE TABLE "purchase_order_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" "currency_code" DEFAULT 'USD' NOT NULL,
	"fx_rate_micros" bigint DEFAULT 1000000 NOT NULL,
	"method" "payment_method" DEFAULT 'bank_transfer' NOT NULL,
	"refunded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"member_id" uuid,
	"created_by_id" uuid,
	"idempotency_key" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_order_refunds" ADD CONSTRAINT "purchase_order_refunds_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_refunds" ADD CONSTRAINT "purchase_order_refunds_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_refunds" ADD CONSTRAINT "purchase_order_refunds_created_by_id_members_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "po_refunds_order_idx" ON "purchase_order_refunds" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "po_refunds_refunded_idx" ON "purchase_order_refunds" USING btree ("refunded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "po_refunds_idempotency_key" ON "purchase_order_refunds" USING btree ("idempotency_key");
--> statement-breakpoint
ALTER TABLE public.purchase_order_refunds
  ADD CONSTRAINT po_refunds_positive_amount CHECK (amount_cents > 0);--> statement-breakpoint

ALTER TABLE public.purchase_order_refunds ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.purchase_order_refunds FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS po_refunds_select ON public.purchase_order_refunds;--> statement-breakpoint
DROP POLICY IF EXISTS po_refunds_insert ON public.purchase_order_refunds;--> statement-breakpoint
CREATE POLICY po_refunds_select ON public.purchase_order_refunds
  FOR SELECT TO authenticated USING (private.is_member());--> statement-breakpoint
CREATE POLICY po_refunds_insert ON public.purchase_order_refunds
  FOR INSERT TO authenticated WITH CHECK (private.can_write());

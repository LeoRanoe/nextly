CREATE TABLE "sale_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" "currency_code" DEFAULT 'USD' NOT NULL,
	"fx_rate_micros" bigint DEFAULT 1000000 NOT NULL,
	"method" "payment_method" DEFAULT 'cash' NOT NULL,
	"refunded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"member_id" uuid,
	"created_by_id" uuid,
	"idempotency_key" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_order_payments" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "sale_refunds" ADD CONSTRAINT "sale_refunds_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_refunds" ADD CONSTRAINT "sale_refunds_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_refunds" ADD CONSTRAINT "sale_refunds_created_by_id_members_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sale_refunds_sale_idx" ON "sale_refunds" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_refunds_refunded_idx" ON "sale_refunds" USING btree ("refunded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "sale_refunds_idempotency_key" ON "sale_refunds" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "po_payments_idempotency_key" ON "purchase_order_payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_payments_idempotency_key" ON "sale_payments" USING btree ("idempotency_key");--> statement-breakpoint
ALTER TABLE public.sale_refunds
  ADD CONSTRAINT sale_refunds_positive_amount CHECK (amount_cents > 0);--> statement-breakpoint

ALTER TABLE public.sale_refunds ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.sale_refunds FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS sale_refunds_select ON public.sale_refunds;--> statement-breakpoint
DROP POLICY IF EXISTS sale_refunds_insert ON public.sale_refunds;--> statement-breakpoint
CREATE POLICY sale_refunds_select ON public.sale_refunds
  FOR SELECT TO authenticated USING (private.is_member());--> statement-breakpoint
CREATE POLICY sale_refunds_insert ON public.sale_refunds
  FOR INSERT TO authenticated WITH CHECK (private.can_write());

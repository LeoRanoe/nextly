CREATE INDEX "products_supplier_idx" ON "products" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "quote_requests_sale_idx" ON "quote_requests" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "quote_requests_handler_idx" ON "quote_requests" USING btree ("handled_by_id");--> statement-breakpoint
CREATE INDEX "expenses_created_by_idx" ON "expenses" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "fx_rates_created_by_idx" ON "fx_rates" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "activity_logs_actor_idx" ON "activity_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_created_by_idx" ON "inventory_movements" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "po_payments_member_idx" ON "purchase_order_payments" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "po_payments_created_by_idx" ON "purchase_order_payments" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "po_refunds_member_idx" ON "purchase_order_refunds" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "po_refunds_created_by_idx" ON "purchase_order_refunds" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_idx" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_created_by_idx" ON "purchase_orders" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "sale_payments_member_idx" ON "sale_payments" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "sale_payments_created_by_idx" ON "sale_payments" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "sale_refunds_member_idx" ON "sale_refunds" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "sale_refunds_created_by_idx" ON "sale_refunds" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "sales_created_by_idx" ON "sales" USING btree ("created_by_id");
-- Cover reverse relationship and conversion-history FK checks without touching
-- product, sale, or accounting semantics.
CREATE INDEX product_relationships_related_idx ON product_relationships (related_product_id);--> statement-breakpoint
CREATE INDEX restock_requests_converted_sale_idx ON restock_requests (converted_sale_id);

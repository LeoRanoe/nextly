-- Storefront merchandising extends the same catalog, variants and inventory
-- records used by the dashboard. No cost, valuation or supplier data is added
-- to the public read model.
CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL,
  logo_url text, website text, description text, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX brands_slug_key ON brands (slug);--> statement-breakpoint
CREATE INDEX brands_active_idx ON brands (active);--> statement-breakpoint
ALTER TABLE products ADD COLUMN brand_id uuid REFERENCES brands(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE products ADD COLUMN model_number text;--> statement-breakpoint
ALTER TABLE products ADD COLUMN key_features jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE products ADD COLUMN best_for jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE products ADD COLUMN compatibility jsonb NOT NULL DEFAULT '{"platforms":[],"protocols":[],"ecosystems":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE products ADD COLUMN buyer_requirements jsonb NOT NULL DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE products ADD COLUMN box_contents jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE products ADD COLUMN nextly_take text;--> statement-breakpoint
ALTER TABLE products ADD COLUMN faq_items jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE products ADD COLUMN featured boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE products ADD COLUMN featured_position integer;--> statement-breakpoint
ALTER TABLE products ADD COLUMN new_until timestamptz;--> statement-breakpoint
ALTER TABLE products ADD COLUMN show_when_out_of_stock boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE products ADD COLUMN restock_notifications_enabled boolean NOT NULL DEFAULT false;--> statement-breakpoint
CREATE INDEX products_brand_idx ON products (brand_id);--> statement-breakpoint
CREATE INDEX products_featured_idx ON products (featured, featured_position);--> statement-breakpoint
CREATE TABLE product_relationships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 related_product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 relationship_type text NOT NULL CHECK (relationship_type IN ('accessory','works_with','alternative','cheaper_alternative','premium_alternative','required_accessory')),
 position integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (product_id <> related_product_id)
);--> statement-breakpoint
CREATE UNIQUE INDEX product_relationships_unique ON product_relationships (product_id, related_product_id, relationship_type);--> statement-breakpoint
CREATE INDEX product_relationships_product_idx ON product_relationships (product_id, position);--> statement-breakpoint
CREATE TABLE storefront_collections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL, description text, image_url text,
 active boolean NOT NULL DEFAULT true, homepage_visible boolean NOT NULL DEFAULT false, position integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX storefront_collections_slug_key ON storefront_collections (slug);--> statement-breakpoint
CREATE INDEX storefront_collections_home_idx ON storefront_collections (homepage_visible, position);--> statement-breakpoint
CREATE TABLE storefront_collection_products (
 collection_id uuid NOT NULL REFERENCES storefront_collections(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE, position integer NOT NULL DEFAULT 0,
 PRIMARY KEY (collection_id, product_id)
);--> statement-breakpoint
CREATE INDEX storefront_collection_products_product_idx ON storefront_collection_products (product_id);--> statement-breakpoint
CREATE TABLE restock_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL, name text, contact text NOT NULL,
 channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
 status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','contacted','converted','cancelled')),
 converted_sale_id uuid REFERENCES sales(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
 contacted_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX restock_requests_status_idx ON restock_requests (status, created_at DESC);--> statement-breakpoint
CREATE INDEX restock_requests_product_idx ON restock_requests (product_id);--> statement-breakpoint
CREATE INDEX restock_requests_variant_idx ON restock_requests (variant_id);--> statement-breakpoint
CREATE INDEX restock_requests_created_idx ON restock_requests (created_at DESC);--> statement-breakpoint
ALTER TABLE categories ADD COLUMN storefront_description text;--> statement-breakpoint
ALTER TABLE categories ADD COLUMN image_url text;--> statement-breakpoint
ALTER TABLE categories ADD COLUMN show_in_storefront_nav boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE categories ADD COLUMN featured boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN pickup_enabled boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN pickup_label text;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN pickup_details text;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN same_day_pickup_enabled boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN pickup_cutoff_time text;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN delivery_enabled boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN delivery_details text;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN delivery_areas text;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN delivery_fee_display text;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN delivery_estimate_display text;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN payment_methods jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN announcement text;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN hero_title text;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN hero_body text;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN support_title text;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN support_body text;--> statement-breakpoint
ALTER TABLE settings ADD COLUMN default_new_arrival_days bigint NOT NULL DEFAULT 30;--> statement-breakpoint
ALTER TABLE bundles ADD COLUMN slug text;--> statement-breakpoint
ALTER TABLE bundles ADD COLUMN summary text;--> statement-breakpoint
ALTER TABLE bundles ADD COLUMN storefront_image_url text;--> statement-breakpoint
ALTER TABLE bundles ADD COLUMN best_for text[] NOT NULL DEFAULT '{}';--> statement-breakpoint
ALTER TABLE bundles ADD COLUMN compatibility_notes text;--> statement-breakpoint
ALTER TABLE bundles ADD COLUMN nextly_take text;--> statement-breakpoint
ALTER TABLE bundles ADD COLUMN seo_title text;--> statement-breakpoint
ALTER TABLE bundles ADD COLUMN seo_description text;--> statement-breakpoint
ALTER TABLE bundles ADD COLUMN catalog_published boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE bundles ADD COLUMN featured boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE bundles ADD COLUMN position integer NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE UNIQUE INDEX bundles_slug_key ON bundles (slug) WHERE slug IS NOT NULL;--> statement-breakpoint
CREATE INDEX bundles_storefront_idx ON bundles (catalog_published, featured, position);--> statement-breakpoint
-- These records are server-action managed. RLS prevents accidental Data API exposure.
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE product_relationships ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE storefront_collections ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE storefront_collection_products ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE restock_requests ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY brands_member_access ON brands TO authenticated USING (private.is_member()) WITH CHECK (private.can_write());--> statement-breakpoint
CREATE POLICY relationships_member_access ON product_relationships TO authenticated USING (private.is_member()) WITH CHECK (private.can_write());--> statement-breakpoint
CREATE POLICY collections_member_access ON storefront_collections TO authenticated USING (private.is_member()) WITH CHECK (private.can_write());--> statement-breakpoint
CREATE POLICY collection_products_member_access ON storefront_collection_products TO authenticated USING (private.is_member()) WITH CHECK (private.can_write());--> statement-breakpoint
CREATE POLICY restock_requests_member_access ON restock_requests TO authenticated USING (private.is_member()) WITH CHECK (private.can_write());

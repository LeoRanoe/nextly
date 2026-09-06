ALTER TABLE product_images
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'product';

ALTER TABLE product_images
  ADD CONSTRAINT product_images_purpose_check
  CHECK (purpose IN ('product', 'packaging', 'lifestyle', 'box_contents'));

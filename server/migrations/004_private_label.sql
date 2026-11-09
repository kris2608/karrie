-- Private-label commercial products linked to a generic parent and a shopping retailer.
ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS private_label boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retailer text;

CREATE INDEX IF NOT EXISTS catalog_products_private_label_retailer_idx
  ON catalog_products (retailer)
  WHERE private_label;

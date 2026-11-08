-- Shared product catalog: products, variants, GTINs, images, facts and durable lookup cache.
-- No shopping lists, photos, IPs or accounts. Credentials stay on the server.

CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  label text NOT NULL,
  short text NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_products (
  id text PRIMARY KEY,
  normalized_key text NOT NULL UNIQUE,
  name text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('generic', 'branded')),
  brand text,
  formulation text,
  category_id text NOT NULL REFERENCES categories(id),
  generic_parent_id text REFERENCES catalog_products(id),
  illustration_key text,
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  approval_status text NOT NULL CHECK (approval_status IN ('candidate', 'approved', 'rejected', 'deprecated')),
  is_default_catalog boolean NOT NULL DEFAULT false,
  origin text NOT NULL CHECK (origin IN ('bundled', 'shared')),
  source_candidate_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

CREATE INDEX IF NOT EXISTS catalog_products_updated_at_idx ON catalog_products (updated_at);
CREATE INDEX IF NOT EXISTS catalog_products_category_id_idx ON catalog_products (category_id);

CREATE TABLE IF NOT EXISTS catalog_aliases (
  alias_normalized text NOT NULL,
  product_id text NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  PRIMARY KEY (alias_normalized, product_id)
);

CREATE INDEX IF NOT EXISTS catalog_aliases_alias_idx ON catalog_aliases (alias_normalized);

CREATE TABLE IF NOT EXISTS product_variants (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  package_quantity numeric,
  package_unit text,
  multipack_count integer,
  package_type text,
  pack_key text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, pack_key)
);

CREATE TABLE IF NOT EXISTS product_identifiers (
  gtin text PRIMARY KEY,
  variant_id text NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  source text NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('off-exact', 'off-partial', 'web-page')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_identifiers_variant_id_idx ON product_identifiers (variant_id);

CREATE TABLE IF NOT EXISTS product_images (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  variant_id text REFERENCES product_variants(id) ON DELETE SET NULL,
  url text NOT NULL,
  source text NOT NULL,
  retailer text,
  source_url text,
  license text,
  usage_status text NOT NULL CHECK (usage_status IN ('cc_by_sa', 'link_only', 'unavailable')),
  preferred boolean NOT NULL DEFAULT false,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, url)
);

CREATE INDEX IF NOT EXISTS product_images_product_id_idx ON product_images (product_id);

CREATE TABLE IF NOT EXISTS product_facts (
  variant_id text NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  source text NOT NULL,
  source_url text,
  license text,
  nutri_score text CHECK (nutri_score IS NULL OR nutri_score IN ('A', 'B', 'C', 'D', 'E')),
  per100 jsonb,
  ingredients text,
  retrieved_at timestamptz NOT NULL,
  refreshed_at timestamptz NOT NULL,
  PRIMARY KEY (variant_id, source)
);

CREATE TABLE IF NOT EXISTS lookup_cache (
  key text PRIMARY KEY,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS lookup_cache_expires_at_idx ON lookup_cache (expires_at);

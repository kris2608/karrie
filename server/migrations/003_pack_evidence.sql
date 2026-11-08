-- Pack-size evidence per GTIN from independent sources. Conflicts are flagged; GTINs are not silently moved.

ALTER TABLE product_identifiers
  ADD COLUMN IF NOT EXISTS pack_conflict boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS product_pack_evidence (
  gtin text NOT NULL,
  source text NOT NULL CHECK (source IN ('openfoodfacts', 'prijsprofeet', 'parent_unverified')),
  quantity_raw text,
  quantity_ml numeric,
  product_name text,
  brand text,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gtin, source)
);

CREATE INDEX IF NOT EXISTS product_pack_evidence_gtin_idx ON product_pack_evidence (gtin);

-- Keep one PrijsProfeet pack-size row per retailer so a majority can win over Open Food Facts.

ALTER TABLE product_pack_evidence
  ADD COLUMN IF NOT EXISTS retailer text NOT NULL DEFAULT '';

ALTER TABLE product_pack_evidence DROP CONSTRAINT IF EXISTS product_pack_evidence_pkey;
ALTER TABLE product_pack_evidence ADD PRIMARY KEY (gtin, source, retailer);

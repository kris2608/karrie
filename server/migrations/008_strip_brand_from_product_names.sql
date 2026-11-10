-- Marker migration: brand-in-name cleanup is applied in application code
-- (cleanProductIdentity on barcode answers / upserts) and via
-- scripts/backfill-product-titles.mjs against production Postgres.
-- A data UPDATE here is skipped because pg-mem (unit tests) lacks char_length/trim.
SELECT 1;

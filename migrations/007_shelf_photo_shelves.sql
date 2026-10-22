-- One brand can have several shelves in the same store. Each shelf has its
-- own before and after. Pictures taken before this change become Shelf 1.

ALTER TABLE shelf_photos ADD COLUMN IF NOT EXISTS shelf_id uuid;

UPDATE shelf_photos AS p
SET shelf_id = grouped.shelf_id
FROM (
  SELECT
    reported_by,
    outlet_id,
    brand_id,
    visit_date,
    gen_random_uuid() AS shelf_id
  FROM shelf_photos
  WHERE shelf_id IS NULL
  GROUP BY reported_by, outlet_id, brand_id, visit_date
) AS grouped
WHERE p.shelf_id IS NULL
  AND p.reported_by = grouped.reported_by
  AND p.outlet_id = grouped.outlet_id
  AND p.brand_id = grouped.brand_id
  AND p.visit_date = grouped.visit_date;

ALTER TABLE shelf_photos ALTER COLUMN shelf_id SET NOT NULL;

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'shelf_photos'::regclass
      AND con.contype = 'u'
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(con.conkey) AS key
        JOIN pg_attribute att
          ON att.attrelid = con.conrelid
         AND att.attnum = key
        WHERE att.attname = 'shelf_id'
      )
  LOOP
    EXECUTE format('ALTER TABLE shelf_photos DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

ALTER TABLE shelf_photos DROP CONSTRAINT IF EXISTS shelf_photos_slot_key;

ALTER TABLE shelf_photos
  ADD CONSTRAINT shelf_photos_slot_key
  UNIQUE (reported_by, outlet_id, brand_id, visit_date, shelf_id, kind);

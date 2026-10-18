-- Shelf pictures for a store visit. Kept apart from the visit rows so
-- editing quantities does not remove the pictures.
CREATE TABLE IF NOT EXISTS shelf_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     uuid NOT NULL REFERENCES brands(id),
  outlet_id    uuid NOT NULL REFERENCES outlets(id),
  reported_by  uuid NOT NULL REFERENCES users(id),
  visit_date   date NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('before', 'after')),
  object_key   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reported_by, outlet_id, brand_id, visit_date, kind)
);

CREATE INDEX IF NOT EXISTS shelf_photos_visit_date_idx
  ON shelf_photos (visit_date, outlet_id);

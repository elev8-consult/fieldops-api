-- Optional note under each before/after shelf photo.
-- Idempotent: safe to re-run.

ALTER TABLE shelf_photos
  ADD COLUMN IF NOT EXISTS notes text;

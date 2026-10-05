-- Lets the mobile app retry an offline visit without creating duplicate reports.
-- The API ignores the key until this column exists, so deploy order does not matter.

ALTER TABLE parsed_reports
  ADD COLUMN IF NOT EXISTS client_submission_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parsed_reports_client_submission
  ON parsed_reports (reported_by, client_submission_id, brand_id)
  WHERE client_submission_id IS NOT NULL;

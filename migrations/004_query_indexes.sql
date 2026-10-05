-- Indexes for the review queue, dashboards, message log and alias lookups.
-- Safe to re-run.

CREATE INDEX IF NOT EXISTS idx_parsed_reports_status_created
  ON parsed_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parsed_reports_brand_report_date
  ON parsed_reports (brand_id, report_date);

CREATE INDEX IF NOT EXISTS idx_report_flags_report_status
  ON report_flags (report_id, status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_received_at
  ON whatsapp_messages (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_aliases_alias_lower
  ON product_aliases (lower(alias));

CREATE INDEX IF NOT EXISTS idx_products_brand_active
  ON products (brand_id, is_active);

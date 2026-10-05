#!/usr/bin/env bash
# Writes migrations/001_baseline.sql from the live database schema (no data).
# Usage: DATABASE_URL=postgres://... ./scripts/dump-baseline.sh
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
out="$(dirname "$0")/../migrations/001_baseline.sql"

{
  echo "-- Baseline schema dumped from production on $(date -u +%Y-%m-%d)."
  echo "-- Only runs on an empty database; scripts/migrate.js skips it otherwise."
  pg_dump "$DATABASE_URL" \
    --schema-only --no-owner --no-privileges --no-comments \
    --exclude-table=schema_migrations
} > "$out"

echo "wrote $out"

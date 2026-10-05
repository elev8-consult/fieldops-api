#!/usr/bin/env node
/**
 * Applies migrations/*.sql in filename order, each in its own transaction,
 * and records them in schema_migrations so they run once.
 *
 *   DATABASE_URL=postgres://... npm run migrate
 *   DATABASE_URL=postgres://... npm run migrate -- --dry-run
 *
 * 001_baseline.sql only runs on an empty database; on an existing database
 * it is recorded as applied without running.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const dryRun = process.argv.includes('--dry-run');
const dir = path.join(__dirname, '..', 'migrations');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const client = new Client({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const applied = new Set(
      (await client.query('SELECT filename FROM schema_migrations')).rows.map(
        (r) => r.filename,
      ),
    );
    const { rows: existing } = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'users'`,
    );
    const databaseHasSchema = existing.length > 0;

    const files = fs
      .readdirSync(dir)
      .filter((f) => /^\d+_.+\.sql$/.test(f))
      .sort();

    for (const file of files) {
      if (applied.has(file)) continue;

      if (file.startsWith('001_') && databaseHasSchema) {
        console.log(`skip   ${file} (existing database; recorded as applied)`);
        if (!dryRun) {
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        }
        continue;
      }

      console.log(`${dryRun ? 'would ' : ''}apply  ${file}`);
      if (dryRun) continue;

      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`${file} failed: ${err.message}`);
      }
    }
    console.log('migrations up to date');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

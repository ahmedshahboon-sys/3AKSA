import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const migrationsDir = fileURLToPath(new URL('../../../database/migrations/', import.meta.url));

try {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await db.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((row) => row.name)
  );

  const files = (await readdir(migrationsDir))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();

  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = await readFile(new URL(`../../../database/migrations/${name}`, import.meta.url), 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Applied migration ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await db.end();
}

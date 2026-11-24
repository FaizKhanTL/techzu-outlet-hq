import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');
// Any constant: makes two instances starting at once apply migrations one after the other.
const LOCK_KEY = 72_401_001;

/**
 * Applies every `migrations/NNN_*.sql` not applied yet, in name order, each in its own transaction. An applied file
 * must never change: its checksum is stored and checked, so an edited migration stops the start-up.
 */
export async function migrate(
  connectionString: string,
  log: (line: string) => void = () => undefined,
) {
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const applied = new Map(
      (
        await client.query<{ name: string; checksum: string }>(
          'SELECT name, checksum FROM schema_migrations',
        )
      ).rows.map((row) => [row.name, row.checksum]),
    );
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((file) => /^\d{3}_.+\.sql$/.test(file))
      .sort();
    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const known = applied.get(file);
      if (known) {
        if (known !== checksum) {
          throw new Error(
            `Migration ${file} was changed after it was applied. Add a new migration instead.`,
          );
        }
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
          file,
          checksum,
        ]);
        await client.query('COMMIT');
        log(`applied ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  migrate(url, (line) => console.log(line))
    .then(() => console.log('migrations up to date'))
    .catch((error: Error) => {
      console.error(error.message);
      process.exit(1);
    });
}

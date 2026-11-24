import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/db/pool';
import { migrate } from '../../src/db/migrate';
import { seedDemoData } from '../../src/db/seed';
import { resetDatabase } from './helpers';

const url = process.env.DATABASE_URL!;
afterAll(() => pool.end());

describe('migrations', () => {
  it('can run again and in parallel without applying anything twice', async () => {
    await Promise.all([migrate(url), migrate(url), migrate(url)]);
    const { rows } = await pool.query<{ name: string }>(
      'SELECT name FROM schema_migrations ORDER BY name',
    );
    expect(rows.map((row) => row.name)).toEqual(['001_initial_schema.sql']);
  });

  it('refuses to start when an applied migration file was changed', async () => {
    const { rows } = await pool.query<{ checksum: string }>(
      'SELECT checksum FROM schema_migrations WHERE name = $1',
      ['001_initial_schema.sql'],
    );
    await pool.query('UPDATE schema_migrations SET checksum = $1 WHERE name = $2', [
      'edited',
      '001_initial_schema.sql',
    ]);
    try {
      await expect(migrate(url)).rejects.toThrow(
        /001_initial_schema\.sql was changed after it was applied/,
      );
    } finally {
      await pool.query('UPDATE schema_migrations SET checksum = $1 WHERE name = $2', [
        rows[0]!.checksum,
        '001_initial_schema.sql',
      ]);
    }
  });
});

describe('demo seed', () => {
  beforeEach(resetDatabase);

  it('loads outlets, menu, stock and sales through the real code paths', async () => {
    await seedDemoData();
    const count = async (table: string) =>
      (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]!.n;
    expect(await count('outlets')).toBe(3);
    expect(await count('users')).toBe(4);
    expect(await count('menu_items')).toBe(10);
    expect(await count('sales')).toBe(24);

    const receipts = await pool.query<{ code: string; seqs: number[] }>(
      `SELECT o.code, array_agg(s.receipt_seq ORDER BY s.receipt_seq) AS seqs
       FROM sales s JOIN outlets o ON o.id = s.outlet_id GROUP BY o.code ORDER BY o.code`,
    );
    for (const row of receipts.rows) expect(row.seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // The ledger explains every unit of stock: opening restock minus what was sold.
    const drift = await pool.query(
      `SELECT i.outlet_id, i.menu_item_id FROM inventory i
       WHERE i.quantity <> (SELECT coalesce(sum(quantity_delta), 0) FROM inventory_movements m
                            WHERE m.outlet_id = i.outlet_id AND m.menu_item_id = i.menu_item_id)`,
    );
    expect(drift.rows).toEqual([]);
  });

  it('does nothing on a database that already has users', async () => {
    await seedDemoData();
    const lines: string[] = [];
    await seedDemoData({ onlyIfEmpty: true, log: (line) => lines.push(line) });
    expect(lines).toEqual(['seed skipped: the database already has users']);
    expect((await pool.query('SELECT count(*)::int AS n FROM outlets')).rows[0].n).toBe(3);
  });
});

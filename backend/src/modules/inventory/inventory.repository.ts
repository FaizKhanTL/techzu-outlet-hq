import type { Queryable } from '../../db/pool';

export type MovementReason = 'RESTOCK' | 'SALE' | 'WASTE' | 'CORRECTION';

export interface InventoryLine {
  menuItemId: string;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  isAvailable: boolean;
  updatedAt: Date;
}

export interface Movement {
  id: string;
  menuItemId: string;
  quantityDelta: number;
  quantityAfter: number;
  reason: MovementReason;
  saleId: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: Date;
}

export async function listInventory(db: Queryable, outletId: string) {
  const { rows } = await db.query<InventoryLine>(
    `SELECT i.menu_item_id AS "menuItemId", m.sku, m.name, m.category, i.quantity,
            omi.is_available AS "isAvailable", i.updated_at AS "updatedAt"
     FROM inventory i
     JOIN menu_items m ON m.id = i.menu_item_id
     JOIN outlet_menu_items omi ON omi.outlet_id = i.outlet_id AND omi.menu_item_id = i.menu_item_id
     WHERE i.outlet_id = $1
     ORDER BY m.category, m.name, m.id`,
    [outletId],
  );
  return rows;
}

/**
 * Locks the stock rows of these items until the transaction ends, always in menu_item_id order so two transactions
 * touching the same items cannot deadlock. Items without a stock row (not assigned) are simply absent.
 */
export async function lockStock(db: Queryable, outletId: string, menuItemIds: string[]) {
  const { rows } = await db.query<{ menuItemId: string; quantity: number }>(
    `SELECT menu_item_id AS "menuItemId", quantity FROM inventory
     WHERE outlet_id = $1 AND menu_item_id = ANY($2::uuid[])
     ORDER BY menu_item_id
     FOR UPDATE`,
    [outletId, [...menuItemIds].sort()],
  );
  return new Map(rows.map((row) => [row.menuItemId, row.quantity]));
}

/**
 * Applies the deltas in one statement. The `quantity + delta >= 0` guard (and the table's CHECK) mean a row that
 * would go negative is not changed: the caller compares the returned rows with what it asked for.
 */
export async function applyStockDeltas(
  db: Queryable,
  outletId: string,
  deltas: { menuItemId: string; delta: number }[],
) {
  const { rows } = await db.query<{ menuItemId: string; quantity: number }>(
    `UPDATE inventory i SET quantity = i.quantity + d.delta
     FROM unnest($2::uuid[], $3::int[]) AS d(menu_item_id, delta)
     WHERE i.outlet_id = $1 AND i.menu_item_id = d.menu_item_id AND i.quantity + d.delta >= 0
     RETURNING i.menu_item_id AS "menuItemId", i.quantity`,
    [outletId, deltas.map((d) => d.menuItemId), deltas.map((d) => d.delta)],
  );
  return new Map(rows.map((row) => [row.menuItemId, row.quantity]));
}

export async function insertMovements(
  db: Queryable,
  outletId: string,
  movements: {
    menuItemId: string;
    quantityDelta: number;
    quantityAfter: number;
    reason: MovementReason;
    saleId: string | null;
    note: string | null;
    createdBy: string | null;
  }[],
) {
  const { rows } = await db.query<Movement>(
    `INSERT INTO inventory_movements
       (outlet_id, menu_item_id, quantity_delta, quantity_after, reason, sale_id, note, created_by)
     SELECT $1, * FROM unnest($2::uuid[], $3::int[], $4::int[], $5::text[], $6::uuid[], $7::text[], $8::uuid[])
     RETURNING id, menu_item_id AS "menuItemId", quantity_delta AS "quantityDelta", quantity_after AS "quantityAfter",
               reason, sale_id AS "saleId", note, created_by AS "createdBy", created_at AS "createdAt"`,
    [
      outletId,
      movements.map((m) => m.menuItemId),
      movements.map((m) => m.quantityDelta),
      movements.map((m) => m.quantityAfter),
      movements.map((m) => m.reason),
      movements.map((m) => m.saleId),
      movements.map((m) => m.note),
      movements.map((m) => m.createdBy),
    ],
  );
  return rows;
}

export async function listMovements(
  db: Queryable,
  outletId: string,
  menuItemId: string,
  limit: number,
  offset: number,
) {
  const [items, count] = await Promise.all([
    db.query<Movement>(
      `SELECT id, menu_item_id AS "menuItemId", quantity_delta AS "quantityDelta", quantity_after AS "quantityAfter",
              reason, sale_id AS "saleId", note, created_by AS "createdBy", created_at AS "createdAt"
       FROM inventory_movements WHERE outlet_id = $1 AND menu_item_id = $2
       ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`,
      [outletId, menuItemId, limit, offset],
    ),
    db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM inventory_movements WHERE outlet_id = $1 AND menu_item_id = $2',
      [outletId, menuItemId],
    ),
  ]);
  return { items: items.rows, total: count.rows[0]!.total };
}

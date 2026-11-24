import type { Queryable } from '../../db/pool';

export interface OutletMenuItem {
  outletId: string;
  menuItemId: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  basePriceCents: number;
  priceOverrideCents: number | null;
  /** What the outlet charges: the override, or the master price. */
  priceCents: number;
  isAvailable: boolean;
  menuItemIsActive: boolean;
  /** Assigned, available and active: the till can sell it. */
  isSellable: boolean;
  stockQuantity: number;
  updatedAt: Date;
}

const SELECT = `
  SELECT omi.outlet_id AS "outletId", m.id AS "menuItemId", m.sku, m.name, m.description, m.category,
         m.base_price_cents AS "basePriceCents", omi.price_override_cents AS "priceOverrideCents",
         COALESCE(omi.price_override_cents, m.base_price_cents) AS "priceCents",
         omi.is_available AS "isAvailable", m.is_active AS "menuItemIsActive",
         (omi.is_available AND m.is_active) AS "isSellable",
         COALESCE(i.quantity, 0) AS "stockQuantity", omi.updated_at AS "updatedAt"
  FROM outlet_menu_items omi
  JOIN menu_items m ON m.id = omi.menu_item_id
  LEFT JOIN inventory i ON i.outlet_id = omi.outlet_id AND i.menu_item_id = omi.menu_item_id`;

export async function listOutletMenu(db: Queryable, outletId: string, sellableOnly: boolean) {
  const { rows } = await db.query<OutletMenuItem>(
    `${SELECT} WHERE omi.outlet_id = $1 AND (NOT $2::boolean OR (omi.is_available AND m.is_active))
     ORDER BY m.category, m.name, m.id`,
    [outletId, sellableOnly],
  );
  return rows;
}

export async function findOutletMenuItem(db: Queryable, outletId: string, menuItemId: string) {
  const { rows } = await db.query<OutletMenuItem>(
    `${SELECT} WHERE omi.outlet_id = $1 AND omi.menu_item_id = $2`,
    [outletId, menuItemId],
  );
  return rows[0];
}

/** Creates or updates an assignment; true when it was new. A missing field keeps its stored value. */
export async function upsertAssignment(
  db: Queryable,
  outletId: string,
  menuItemId: string,
  input: { priceOverrideCents?: number | null; isAvailable?: boolean },
): Promise<boolean> {
  const { rows } = await db.query<{ created: boolean }>(
    `INSERT INTO outlet_menu_items AS omi (outlet_id, menu_item_id, price_override_cents, is_available)
     VALUES ($1, $2, $4, COALESCE($5, true))
     ON CONFLICT (outlet_id, menu_item_id) DO UPDATE SET
       price_override_cents = CASE WHEN $3::boolean THEN EXCLUDED.price_override_cents ELSE omi.price_override_cents END,
       is_available = COALESCE($5, omi.is_available)
     RETURNING (xmax = 0) AS created`,
    [
      outletId,
      menuItemId,
      input.priceOverrideCents !== undefined,
      input.priceOverrideCents ?? null,
      input.isAvailable ?? null,
    ],
  );
  // Every assigned item has a stock row, starting at zero.
  await db.query(
    `INSERT INTO inventory (outlet_id, menu_item_id) VALUES ($1, $2) ON CONFLICT (outlet_id, menu_item_id) DO NOTHING`,
    [outletId, menuItemId],
  );
  return rows[0]!.created;
}

export async function updateAssignment(
  db: Queryable,
  outletId: string,
  menuItemId: string,
  input: { priceOverrideCents?: number | null; isAvailable?: boolean },
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE outlet_menu_items SET
       price_override_cents = CASE WHEN $3::boolean THEN $4 ELSE price_override_cents END,
       is_available = COALESCE($5, is_available)
     WHERE outlet_id = $1 AND menu_item_id = $2`,
    [
      outletId,
      menuItemId,
      input.priceOverrideCents !== undefined,
      input.priceOverrideCents ?? null,
      input.isAvailable ?? null,
    ],
  );
  return (rowCount ?? 0) > 0;
}

export async function deleteAssignment(
  db: Queryable,
  outletId: string,
  menuItemId: string,
): Promise<boolean> {
  const { rowCount } = await db.query(
    'DELETE FROM outlet_menu_items WHERE outlet_id = $1 AND menu_item_id = $2',
    [outletId, menuItemId],
  );
  return (rowCount ?? 0) > 0;
}

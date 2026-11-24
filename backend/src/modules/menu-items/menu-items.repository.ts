import type { Queryable } from '../../db/pool';

export interface MenuItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  basePriceCents: number;
  isActive: boolean;
  assignedOutletCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `m.id, m.sku, m.name, m.description, m.category, m.base_price_cents AS "basePriceCents",
  m.is_active AS "isActive", m.created_at AS "createdAt", m.updated_at AS "updatedAt",
  (SELECT count(*)::int FROM outlet_menu_items omi WHERE omi.menu_item_id = m.id) AS "assignedOutletCount"`;

export async function insertMenuItem(
  db: Queryable,
  input: {
    sku: string;
    name: string;
    description: string | null;
    category: string;
    basePriceCents: number;
  },
) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO menu_items (sku, name, description, category, base_price_cents)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.sku, input.name, input.description, input.category, input.basePriceCents],
  );
  return (await findMenuItemById(db, rows[0]!.id))!;
}

export async function updateMenuItem(
  db: Queryable,
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    category?: string;
    basePriceCents?: number;
    isActive?: boolean;
  },
) {
  const { rowCount } = await db.query(
    `UPDATE menu_items SET
       name = COALESCE($2, name),
       description = CASE WHEN $3::boolean THEN $4 ELSE description END,
       category = COALESCE($5, category),
       base_price_cents = COALESCE($6, base_price_cents),
       is_active = COALESCE($7, is_active)
     WHERE id = $1`,
    [
      id,
      patch.name ?? null,
      'description' in patch,
      patch.description ?? null,
      patch.category ?? null,
      patch.basePriceCents ?? null,
      patch.isActive ?? null,
    ],
  );
  return rowCount ? findMenuItemById(db, id) : undefined;
}

export async function findMenuItemById(db: Queryable, id: string) {
  const { rows } = await db.query<MenuItem>(`SELECT ${COLUMNS} FROM menu_items m WHERE m.id = $1`, [
    id,
  ]);
  return rows[0];
}

export async function listMenuItems(
  db: Queryable,
  filter: { limit: number; offset: number; search?: string; category?: string; isActive?: boolean },
) {
  const where = `WHERE ($1::text IS NULL OR m.sku ILIKE '%' || $1 || '%' OR m.name ILIKE '%' || $1 || '%')
                   AND ($2::text IS NULL OR m.category = $2)
                   AND ($3::boolean IS NULL OR m.is_active = $3)`;
  const params = [filter.search ?? null, filter.category ?? null, filter.isActive ?? null];
  const [items, count] = await Promise.all([
    db.query<MenuItem>(
      `SELECT ${COLUMNS} FROM menu_items m ${where} ORDER BY m.category, m.name, m.id LIMIT $4 OFFSET $5`,
      [...params, filter.limit, filter.offset],
    ),
    db.query<{ total: number }>(`SELECT count(*)::int AS total FROM menu_items m ${where}`, params),
  ]);
  return { items: items.rows, total: count.rows[0]!.total };
}

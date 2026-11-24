import type { Queryable } from '../../db/pool';

export interface OutletRevenue {
  outletId: string;
  outletCode: string;
  outletName: string;
  outletIsActive: boolean;
  saleCount: number;
  itemsSold: number;
  revenueCents: number;
}

export interface TopItemRow {
  outletId: string;
  rank: number;
  menuItemId: string;
  sku: string;
  name: string;
  quantitySold: number;
  revenueCents: number;
}

/** Every outlet, with zero when it sold nothing in the range, highest revenue first. */
export async function revenueByOutlet(db: Queryable, range: { from?: string; to?: string }) {
  const { rows } = await db.query<OutletRevenue>(
    `SELECT o.id AS "outletId", o.code AS "outletCode", o.name AS "outletName", o.is_active AS "outletIsActive",
            COALESCE(s.sale_count, 0)::int AS "saleCount",
            COALESCE(s.items_sold, 0)::bigint AS "itemsSold",
            COALESCE(s.revenue, 0)::bigint AS "revenueCents"
     FROM outlets o
     LEFT JOIN (
       SELECT outlet_id, count(*) AS sale_count, sum(item_count) AS items_sold, sum(total_cents) AS revenue
       FROM sales
       WHERE ($1::timestamptz IS NULL OR created_at >= $1) AND ($2::timestamptz IS NULL OR created_at < $2)
       GROUP BY outlet_id
     ) s ON s.outlet_id = o.id
     ORDER BY "revenueCents" DESC, o.code`,
    [range.from ?? null, range.to ?? null],
  );
  return rows;
}

/**
 * The best sellers of each outlet by quantity. Ties are broken by revenue, then name, then id, so the same data
 * always gives the same ranking.
 */
export async function topItems(
  db: Queryable,
  filter: { from?: string; to?: string; outletId?: string; limit: number },
) {
  const { rows } = await db.query<TopItemRow>(
    `WITH totals AS (
       SELECT s.outlet_id, si.menu_item_id, sum(si.quantity) AS quantity_sold, sum(si.line_total_cents) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE ($1::timestamptz IS NULL OR s.created_at >= $1) AND ($2::timestamptz IS NULL OR s.created_at < $2)
         AND ($3::uuid IS NULL OR s.outlet_id = $3)
       GROUP BY s.outlet_id, si.menu_item_id
     ), ranked AS (
       SELECT t.*, m.sku, m.name,
              row_number() OVER (PARTITION BY t.outlet_id ORDER BY t.quantity_sold DESC, t.revenue DESC, m.name, m.id) AS rank
       FROM totals t
       JOIN menu_items m ON m.id = t.menu_item_id
     )
     SELECT outlet_id AS "outletId", rank::int AS rank, menu_item_id AS "menuItemId", sku, name,
            quantity_sold::bigint AS "quantitySold", revenue::bigint AS "revenueCents"
     FROM ranked WHERE rank <= $4
     ORDER BY outlet_id, rank`,
    [filter.from ?? null, filter.to ?? null, filter.outletId ?? null, filter.limit],
  );
  return rows;
}

import type { Queryable } from '../../db/pool';

export interface SaleLine {
  menuItemId: string;
  sku: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface Sale {
  id: string;
  outletId: string;
  receiptSeq: number;
  receiptNumber: string;
  totalCents: number;
  itemCount: number;
  paymentMethod: string;
  note: string | null;
  createdBy: string | null;
  createdAt: Date;
  items: SaleLine[];
}

export interface SellableCheck {
  menuItemId: string;
  sku: string;
  name: string;
  priceCents: number;
  isSellable: boolean;
}

/** The outlet's view of these items: price and whether the till may sell them. Unassigned items are absent. */
export async function findOutletItems(db: Queryable, outletId: string, menuItemIds: string[]) {
  const { rows } = await db.query<SellableCheck>(
    `SELECT m.id AS "menuItemId", m.sku, m.name,
            COALESCE(omi.price_override_cents, m.base_price_cents) AS "priceCents",
            (omi.is_available AND m.is_active) AS "isSellable"
     FROM outlet_menu_items omi
     JOIN menu_items m ON m.id = omi.menu_item_id
     WHERE omi.outlet_id = $1 AND omi.menu_item_id = ANY($2::uuid[])`,
    [outletId, menuItemIds],
  );
  return new Map(rows.map((row) => [row.menuItemId, row]));
}

/**
 * The next receipt number of the outlet. The row stays locked until the transaction ends, so concurrent sales of one
 * outlet take numbers one at a time; a rollback undoes the increment, so no number is skipped.
 */
export async function nextReceiptSeq(db: Queryable, outletId: string): Promise<number> {
  const { rows } = await db.query<{ lastSeq: number }>(
    `INSERT INTO outlet_receipt_counters (outlet_id, last_seq) VALUES ($1, 1)
     ON CONFLICT (outlet_id) DO UPDATE SET last_seq = outlet_receipt_counters.last_seq + 1
     RETURNING last_seq AS "lastSeq"`,
    [outletId],
  );
  return rows[0]!.lastSeq;
}

export async function insertSale(
  db: Queryable,
  sale: {
    outletId: string;
    receiptSeq: number;
    receiptNumber: string;
    totalCents: number;
    itemCount: number;
    paymentMethod: string;
    note: string | null;
    idempotencyKey: string | null;
    requestHash: string | null;
    createdBy: string;
  },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO sales (outlet_id, receipt_seq, receipt_number, total_cents, item_count, payment_method, note,
                        idempotency_key, request_hash, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      sale.outletId,
      sale.receiptSeq,
      sale.receiptNumber,
      sale.totalCents,
      sale.itemCount,
      sale.paymentMethod,
      sale.note,
      sale.idempotencyKey,
      sale.requestHash,
      sale.createdBy,
    ],
  );
  return rows[0]!.id;
}

export async function insertSaleLines(db: Queryable, saleId: string, lines: SaleLine[]) {
  await db.query(
    `INSERT INTO sale_items (sale_id, menu_item_id, sku, name, unit_price_cents, quantity, line_total_cents)
     SELECT $1, * FROM unnest($2::uuid[], $3::text[], $4::text[], $5::int[], $6::int[], $7::bigint[])`,
    [
      saleId,
      lines.map((line) => line.menuItemId),
      lines.map((line) => line.sku),
      lines.map((line) => line.name),
      lines.map((line) => line.unitPriceCents),
      lines.map((line) => line.quantity),
      lines.map((line) => line.lineTotalCents),
    ],
  );
}

const SALE_COLUMNS = `s.id, s.outlet_id AS "outletId", s.receipt_seq AS "receiptSeq", s.receipt_number AS "receiptNumber",
  s.total_cents AS "totalCents", s.item_count AS "itemCount", s.payment_method AS "paymentMethod", s.note,
  s.created_by AS "createdBy", s.created_at AS "createdAt",
  COALESCE((
    SELECT json_agg(json_build_object(
      'menuItemId', si.menu_item_id, 'sku', si.sku, 'name', si.name, 'unitPriceCents', si.unit_price_cents,
      'quantity', si.quantity, 'lineTotalCents', si.line_total_cents) ORDER BY si.name, si.menu_item_id)
    FROM sale_items si WHERE si.sale_id = s.id), '[]'::json) AS items`;

export async function findSale(db: Queryable, outletId: string, saleId: string) {
  const { rows } = await db.query<Sale>(
    `SELECT ${SALE_COLUMNS} FROM sales s WHERE s.outlet_id = $1 AND s.id = $2`,
    [outletId, saleId],
  );
  return rows[0];
}

export async function findSaleByIdempotencyKey(db: Queryable, outletId: string, key: string) {
  const { rows } = await db.query<Sale & { requestHash: string }>(
    `SELECT ${SALE_COLUMNS}, s.request_hash AS "requestHash" FROM sales s
     WHERE s.outlet_id = $1 AND s.idempotency_key = $2`,
    [outletId, key],
  );
  return rows[0];
}

export async function listSales(
  db: Queryable,
  outletId: string,
  filter: { limit: number; offset: number; from?: string; to?: string },
) {
  const where = `WHERE s.outlet_id = $1 AND ($2::timestamptz IS NULL OR s.created_at >= $2)
                   AND ($3::timestamptz IS NULL OR s.created_at < $3)`;
  const params = [outletId, filter.from ?? null, filter.to ?? null];
  const [items, count] = await Promise.all([
    // Newest first by receipt number: the outlet's counter is the order sales really happened in. created_at is the
    // transaction start, so two sales can share it, or (two tills at once) come out of receipt order.
    db.query<Sale>(
      `SELECT ${SALE_COLUMNS} FROM sales s ${where} ORDER BY s.receipt_seq DESC LIMIT $4 OFFSET $5`,
      [...params, filter.limit, filter.offset],
    ),
    db.query<{ total: number }>(`SELECT count(*)::int AS total FROM sales s ${where}`, params),
  ]);
  return { items: items.rows, total: count.rows[0]!.total };
}

import type { Queryable } from '../../db/pool';

export interface Outlet {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `id, code, name, address, is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"`;

export async function insertOutlet(
  db: Queryable,
  input: { code: string; name: string; address: string | null },
) {
  const { rows } = await db.query<Outlet>(
    `INSERT INTO outlets (code, name, address) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
    [input.code, input.name, input.address],
  );
  return rows[0]!;
}

export async function updateOutlet(
  db: Queryable,
  id: string,
  patch: { name?: string; address?: string | null; isActive?: boolean },
) {
  // A missing key keeps the column; an explicit null clears the address.
  const { rows } = await db.query<Outlet>(
    `UPDATE outlets SET
       name = COALESCE($2, name),
       address = CASE WHEN $3::boolean THEN $4 ELSE address END,
       is_active = COALESCE($5, is_active)
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id, patch.name ?? null, 'address' in patch, patch.address ?? null, patch.isActive ?? null],
  );
  return rows[0];
}

export async function findOutletById(db: Queryable, id: string) {
  const { rows } = await db.query<Outlet>(`SELECT ${COLUMNS} FROM outlets WHERE id = $1`, [id]);
  return rows[0];
}

export async function listOutlets(
  db: Queryable,
  filter: { limit: number; offset: number; search?: string; isActive?: boolean },
) {
  const where = `WHERE ($1::text IS NULL OR code ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%')
                   AND ($2::boolean IS NULL OR is_active = $2)`;
  const params = [filter.search ?? null, filter.isActive ?? null];
  const [items, count] = await Promise.all([
    db.query<Outlet>(`SELECT ${COLUMNS} FROM outlets ${where} ORDER BY code LIMIT $3 OFFSET $4`, [
      ...params,
      filter.limit,
      filter.offset,
    ]),
    db.query<{ total: number }>(`SELECT count(*)::int AS total FROM outlets ${where}`, params),
  ]);
  return { items: items.rows, total: count.rows[0]!.total };
}

import type { Queryable } from '../../db/pool';
import type { Role } from './auth.types';

export interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: Role;
  outletId: string | null;
  isActive: boolean;
  outletIsActive: boolean | null;
}

const SELECT_USER = `
  SELECT u.id, u.email, u.full_name AS "fullName", u.password_hash AS "passwordHash", u.role,
         u.outlet_id AS "outletId", u.is_active AS "isActive", o.is_active AS "outletIsActive"
  FROM users u
  LEFT JOIN outlets o ON o.id = u.outlet_id`;

export async function findUserByEmail(
  db: Queryable,
  email: string,
): Promise<UserRecord | undefined> {
  const { rows } = await db.query<UserRecord>(`${SELECT_USER} WHERE lower(u.email) = lower($1)`, [
    email,
  ]);
  return rows[0];
}

export async function findUserById(db: Queryable, id: string): Promise<UserRecord | undefined> {
  const { rows } = await db.query<UserRecord>(`${SELECT_USER} WHERE u.id = $1`, [id]);
  return rows[0];
}

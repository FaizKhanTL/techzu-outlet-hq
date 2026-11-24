export const ROLES = ['HQ_ADMIN', 'OUTLET_STAFF'] as const;
export type Role = (typeof ROLES)[number];

/** Who is calling, as checked on every request. */
export interface AuthContext {
  userId: string;
  email: string;
  role: Role;
  /** The staff member's outlet; null for HQ. */
  outletId: string | null;
}

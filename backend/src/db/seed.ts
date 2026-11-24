import { pool } from './pool';
import { hashPassword } from '../modules/auth/password';
import { createOutlet } from '../modules/outlets/outlets.service';
import { createMenuItem } from '../modules/menu-items/menu-items.service';
import { assign } from '../modules/outlet-menu/outlet-menu.service';
import { adjustStock } from '../modules/inventory/inventory.service';
import { createSale } from '../modules/sales/sales.service';
import type { AuthContext } from '../modules/auth/auth.types';

/** Demo sign-in password for every seeded account. Demo data only; change or remove it for a real deployment. */
export const DEMO_PASSWORD = 'Password123!';

const OUTLETS = [
  { code: 'KLCC', name: 'KLCC Flagship', address: 'Lot 101, Suria KLCC, Kuala Lumpur' },
  { code: 'PJ', name: 'Petaling Jaya', address: '1 Jalan SS2/24, Petaling Jaya' },
  { code: 'PENANG', name: 'Penang Gurney', address: 'Gurney Plaza, George Town, Penang' },
];

const MENU = [
  { sku: 'COF-AMERICANO', name: 'Americano', category: 'Coffee', basePriceCents: 900 },
  { sku: 'COF-LATTE', name: 'Cafe Latte', category: 'Coffee', basePriceCents: 1200 },
  { sku: 'COF-CAPPUCCINO', name: 'Cappuccino', category: 'Coffee', basePriceCents: 1200 },
  { sku: 'COF-MOCHA', name: 'Mocha', category: 'Coffee', basePriceCents: 1400 },
  { sku: 'TEA-TEH-TARIK', name: 'Teh Tarik', category: 'Tea', basePriceCents: 600 },
  { sku: 'TEA-MATCHA', name: 'Matcha Latte', category: 'Tea', basePriceCents: 1500 },
  { sku: 'FOOD-NASI-LEMAK', name: 'Nasi Lemak Ayam', category: 'Food', basePriceCents: 1800 },
  { sku: 'FOOD-SANDWICH', name: 'Chicken Sandwich', category: 'Food', basePriceCents: 1600 },
  { sku: 'FOOD-CROISSANT', name: 'Butter Croissant', category: 'Food', basePriceCents: 800 },
  { sku: 'DES-CHEESECAKE', name: 'Burnt Cheesecake', category: 'Dessert', basePriceCents: 1700 },
];

// Which outlet sells which SKU, and at what price when it differs from the master price.
const ASSIGNMENTS: Record<string, Record<string, number | null>> = {
  KLCC: {
    'COF-AMERICANO': 1000,
    'COF-LATTE': 1300,
    'COF-CAPPUCCINO': 1300,
    'COF-MOCHA': null,
    'TEA-TEH-TARIK': null,
    'TEA-MATCHA': 1600,
    'FOOD-NASI-LEMAK': 2000,
    'FOOD-CROISSANT': null,
    'DES-CHEESECAKE': 1800,
  },
  PJ: {
    'COF-AMERICANO': null,
    'COF-LATTE': null,
    'TEA-TEH-TARIK': 550,
    'FOOD-NASI-LEMAK': null,
    'FOOD-SANDWICH': null,
    'FOOD-CROISSANT': null,
  },
  PENANG: {
    'COF-AMERICANO': null,
    'COF-LATTE': 1150,
    'COF-MOCHA': null,
    'TEA-TEH-TARIK': null,
    'TEA-MATCHA': null,
    'DES-CHEESECAKE': null,
  },
};

export async function seedDemoData({
  onlyIfEmpty = false,
  log = () => undefined,
}: { onlyIfEmpty?: boolean; log?: (line: string) => void } = {}) {
  const { rows } = await pool.query<{ users: number }>('SELECT count(*)::int AS users FROM users');
  if (onlyIfEmpty && rows[0]!.users > 0) {
    log('seed skipped: the database already has users');
    return;
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const { rows: admins } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, full_name, password_hash, role) VALUES ('hq@example.com', 'HQ Admin', $1, 'HQ_ADMIN')
     RETURNING id`,
    [passwordHash],
  );
  const hq: AuthContext = {
    userId: admins[0]!.id,
    email: 'hq@example.com',
    role: 'HQ_ADMIN',
    outletId: null,
  };

  const outlets = new Map<string, string>();
  const staff = new Map<string, AuthContext>();
  for (const outlet of OUTLETS) {
    const created = await createOutlet(outlet);
    outlets.set(outlet.code, created.id);
    const email = `${outlet.code.toLowerCase()}.staff@example.com`;
    const { rows: users } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, full_name, password_hash, role, outlet_id)
       VALUES ($1, $2, $3, 'OUTLET_STAFF', $4) RETURNING id`,
      [email, `${outlet.name} Staff`, passwordHash, created.id],
    );
    staff.set(outlet.code, {
      userId: users[0]!.id,
      email,
      role: 'OUTLET_STAFF',
      outletId: created.id,
    });
  }

  const items = new Map<string, string>();
  for (const item of MENU) {
    items.set(item.sku, (await createMenuItem({ ...item, description: null })).id);
  }

  for (const [code, skus] of Object.entries(ASSIGNMENTS)) {
    const outletId = outlets.get(code)!;
    for (const [sku, priceOverrideCents] of Object.entries(skus)) {
      const menuItemId = items.get(sku)!;
      await assign(outletId, menuItemId, { priceOverrideCents });
      await adjustStock(hq, outletId, menuItemId, {
        quantityDelta: 60 + ((sku.length * 7) % 90),
        reason: 'RESTOCK',
        note: 'Opening stock',
      });
    }
  }

  // A few sales through the real sale path, so the reports have something to show.
  let sales = 0;
  for (const [code, skus] of Object.entries(ASSIGNMENTS)) {
    const outletId = outlets.get(code)!;
    const skuList = Object.keys(skus);
    for (let i = 0; i < 8; i++) {
      const picks = [skuList[i % skuList.length]!, skuList[(i * 3 + 1) % skuList.length]!];
      await createSale(staff.get(code)!, outletId, {
        items: picks.map((sku, n) => ({
          menuItemId: items.get(sku)!,
          quantity: 1 + ((i + n) % 3),
        })),
        paymentMethod: (['CASH', 'CARD', 'E_WALLET'] as const)[i % 3]!,
        note: null,
      });
      sales++;
    }
  }

  log(
    `seeded ${OUTLETS.length} outlets, ${MENU.length} menu items, ${sales} sales; ` +
      `sign in as hq@example.com or <code>.staff@example.com with ${DEMO_PASSWORD}`,
  );
}

if (require.main === module) {
  seedDemoData({
    onlyIfEmpty: process.argv.includes('--if-empty'),
    log: (line) => console.log(line),
  })
    .catch((error: Error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

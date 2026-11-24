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
  {
    code: 'ORCHARD',
    name: 'Orchard Flagship',
    address: '2 Orchard Turn, #B2-01, Singapore 238801',
  },
  { code: 'MARINA', name: 'Marina Bay', address: '10 Bayfront Avenue, #01-12, Singapore 018956' },
  { code: 'TAMPINES', name: 'Tampines Hub', address: '1 Tampines Walk, #01-21, Singapore 528523' },
];

// Prices in SGD cents.
const MENU = [
  { sku: 'COF-AMERICANO', name: 'Americano', category: 'Coffee', basePriceCents: 550 },
  { sku: 'COF-LATTE', name: 'Cafe Latte', category: 'Coffee', basePriceCents: 650 },
  { sku: 'COF-CAPPUCCINO', name: 'Cappuccino', category: 'Coffee', basePriceCents: 650 },
  { sku: 'COF-MOCHA', name: 'Mocha', category: 'Coffee', basePriceCents: 700 },
  { sku: 'TEA-TEH-TARIK', name: 'Teh Tarik', category: 'Tea', basePriceCents: 350 },
  { sku: 'TEA-MATCHA', name: 'Matcha Latte', category: 'Tea', basePriceCents: 750 },
  { sku: 'FOOD-KAYA-TOAST', name: 'Kaya Toast Set', category: 'Food', basePriceCents: 580 },
  { sku: 'FOOD-SANDWICH', name: 'Chicken Sandwich', category: 'Food', basePriceCents: 950 },
  { sku: 'FOOD-CROISSANT', name: 'Butter Croissant', category: 'Food', basePriceCents: 480 },
  { sku: 'DES-CHEESECAKE', name: 'Burnt Cheesecake', category: 'Dessert', basePriceCents: 890 },
];

// Which outlet sells which SKU, and at what price when it differs from the master price.
const ASSIGNMENTS: Record<string, Record<string, number | null>> = {
  ORCHARD: {
    'COF-AMERICANO': 600,
    'COF-LATTE': 700,
    'COF-CAPPUCCINO': 700,
    'COF-MOCHA': null,
    'TEA-TEH-TARIK': null,
    'TEA-MATCHA': 800,
    'FOOD-KAYA-TOAST': 620,
    'FOOD-CROISSANT': null,
    'DES-CHEESECAKE': 950,
  },
  MARINA: {
    'COF-AMERICANO': null,
    'COF-LATTE': null,
    'TEA-TEH-TARIK': 380,
    'FOOD-KAYA-TOAST': null,
    'FOOD-SANDWICH': null,
    'FOOD-CROISSANT': null,
  },
  TAMPINES: {
    'COF-AMERICANO': null,
    'COF-LATTE': 600,
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

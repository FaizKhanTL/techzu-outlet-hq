export type Role = 'HQ_ADMIN' | 'OUTLET_STAFF';
export type PaymentMethod = 'CASH' | 'CARD' | 'E_WALLET';
export type AdjustmentReason = 'RESTOCK' | 'WASTE' | 'CORRECTION';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  outletId: string | null;
  currency: string;
}

export interface Page<T> {
  data: T[];
  meta: { limit: number; offset: number; total: number };
}

export interface Outlet {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  basePriceCents: number;
  isActive: boolean;
  assignedOutletCount: number;
}

export interface OutletMenuItem {
  outletId: string;
  menuItemId: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  basePriceCents: number;
  priceOverrideCents: number | null;
  priceCents: number;
  isAvailable: boolean;
  menuItemIsActive: boolean;
  isSellable: boolean;
  stockQuantity: number;
}

export interface InventoryLine {
  menuItemId: string;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  isAvailable: boolean;
  updatedAt: string;
}

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
  paymentMethod: PaymentMethod;
  note: string | null;
  createdAt: string;
  currency: string;
  items: SaleLine[];
}

export interface RevenueReport {
  currency: string;
  totals: { saleCount: number; itemsSold: number; revenueCents: number };
  outlets: {
    outletId: string;
    outletCode: string;
    outletName: string;
    outletIsActive: boolean;
    saleCount: number;
    itemsSold: number;
    revenueCents: number;
  }[];
}

export interface TopItemsReport {
  currency: string;
  limit: number;
  outlets: {
    outletId: string;
    outletCode: string;
    outletName: string;
    items: {
      rank: number;
      menuItemId: string;
      sku: string;
      name: string;
      quantitySold: number;
      revenueCents: number;
    }[];
  }[];
}

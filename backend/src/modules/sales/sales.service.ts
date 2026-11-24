import { createHash } from 'node:crypto';
import { pool } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import { env } from '../../config/env';
import { ConflictError, NotFoundError, UnprocessableError } from '../../lib/errors';
import { findOutletById } from '../outlets/outlets.repository';
import { applyStockDeltas, insertMovements, lockStock } from '../inventory/inventory.repository';
import type { AuthContext } from '../auth/auth.types';
import { MAX_LINE_QUANTITY } from './sales.schemas';
import * as repo from './sales.repository';

export interface CreateSaleInput {
  items: { menuItemId: string; quantity: number }[];
  paymentMethod: 'CASH' | 'CARD' | 'E_WALLET';
  note: string | null;
}

/** The same item twice in one sale becomes one line, so the stock check and the receipt see one quantity. */
function mergeLines(items: CreateSaleInput['items']) {
  const quantities = new Map<string, number>();
  for (const item of items)
    quantities.set(item.menuItemId, (quantities.get(item.menuItemId) ?? 0) + item.quantity);
  const merged = [...quantities].map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
  const tooMany = merged.filter((line) => line.quantity > MAX_LINE_QUANTITY);
  if (tooMany.length > 0) {
    throw new UnprocessableError(
      `At most ${MAX_LINE_QUANTITY} of one item per sale.`,
      tooMany.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
      'LINE_QUANTITY_TOO_HIGH',
    );
  }
  return merged.sort((a, b) => a.menuItemId.localeCompare(b.menuItemId));
}

/** Fingerprint of what was asked for, so a reused Idempotency-Key with a different sale can be refused. */
const hashRequest = (lines: { menuItemId: string; quantity: number }[], input: CreateSaleInput) =>
  createHash('sha256')
    .update(JSON.stringify({ lines, paymentMethod: input.paymentMethod, note: input.note }))
    .digest('hex');

const withCurrency = (sale: repo.Sale) => ({ ...sale, currency: env.CURRENCY });

async function replay(outletId: string, key: string, requestHash: string) {
  const existing = await repo.findSaleByIdempotencyKey(pool, outletId, key);
  if (!existing) return undefined;
  if (existing.requestHash !== requestHash) {
    throw new ConflictError(
      'This Idempotency-Key was already used for a different sale.',
      { receiptNumber: existing.receiptNumber },
      'IDEMPOTENCY_KEY_REUSED',
    );
  }
  const { requestHash: _hash, ...sale } = existing;
  return withCurrency(sale);
}

/**
 * Records a sale: checks every item is on this outlet's menu and sellable, locks and checks the stock, deducts it,
 * takes the next receipt number and writes the sale, its lines and the stock ledger, all in one transaction. Any
 * failure rolls everything back, the receipt number included. Prices come from the outlet's menu, never the client.
 */
export async function createSale(
  auth: AuthContext,
  outletId: string,
  input: CreateSaleInput,
  idempotencyKey?: string,
): Promise<{ sale: ReturnType<typeof withCurrency>; replayed: boolean }> {
  const lines = mergeLines(input.items);
  const requestHash = idempotencyKey ? hashRequest(lines, input) : null;

  if (idempotencyKey) {
    const previous = await replay(outletId, idempotencyKey, requestHash!);
    if (previous) return { sale: previous, replayed: true };
  }

  try {
    const sale = await withTransaction(async (client) => {
      const outlet = await findOutletById(client, outletId);
      if (!outlet) throw new NotFoundError('Outlet');
      if (!outlet.isActive) {
        throw new UnprocessableError(
          'This outlet is not active and cannot record sales.',
          undefined,
          'OUTLET_INACTIVE',
        );
      }

      const ids = lines.map((line) => line.menuItemId);
      const menu = await repo.findOutletItems(client, outletId, ids);
      const notSellable = lines
        .map((line) => ({ line, item: menu.get(line.menuItemId) }))
        .filter(({ item }) => !item?.isSellable)
        .map(({ line, item }) => ({
          menuItemId: line.menuItemId,
          reason: item ? 'UNAVAILABLE' : 'NOT_ON_OUTLET_MENU',
        }));
      if (notSellable.length > 0) {
        throw new UnprocessableError(
          'Some items cannot be sold at this outlet.',
          notSellable,
          'ITEMS_NOT_SELLABLE',
        );
      }

      const stock = await lockStock(client, outletId, ids);
      const shortages = lines
        .filter((line) => (stock.get(line.menuItemId) ?? 0) < line.quantity)
        .map((line) => ({
          menuItemId: line.menuItemId,
          sku: menu.get(line.menuItemId)!.sku,
          requested: line.quantity,
          available: stock.get(line.menuItemId) ?? 0,
        }));
      if (shortages.length > 0) {
        throw new ConflictError(
          'Not enough stock for some items.',
          shortages,
          'INSUFFICIENT_STOCK',
        );
      }

      const after = await applyStockDeltas(
        client,
        outletId,
        lines.map((line) => ({ menuItemId: line.menuItemId, delta: -line.quantity })),
      );
      if (after.size !== lines.length) {
        // Cannot happen while the rows are locked; refuse rather than write a sale with stock not taken.
        throw new ConflictError(
          'Stock changed while the sale was being recorded. Please retry.',
          undefined,
          'STOCK_CHANGED',
        );
      }

      const saleLines: repo.SaleLine[] = lines.map((line) => {
        const item = menu.get(line.menuItemId)!;
        return {
          menuItemId: line.menuItemId,
          sku: item.sku,
          name: item.name,
          unitPriceCents: item.priceCents,
          quantity: line.quantity,
          lineTotalCents: item.priceCents * line.quantity,
        };
      });

      // Taken last, after the stock locks, so the per-outlet counter is held for as short a time as possible.
      const receiptSeq = await repo.nextReceiptSeq(client, outletId);
      const saleId = await repo.insertSale(client, {
        outletId,
        receiptSeq,
        receiptNumber: `${outlet.code}-${String(receiptSeq).padStart(6, '0')}`,
        totalCents: saleLines.reduce((sum, line) => sum + line.lineTotalCents, 0),
        itemCount: saleLines.reduce((sum, line) => sum + line.quantity, 0),
        paymentMethod: input.paymentMethod,
        note: input.note,
        idempotencyKey: idempotencyKey ?? null,
        requestHash,
        createdBy: auth.userId,
      });
      await repo.insertSaleLines(client, saleId, saleLines);
      await insertMovements(
        client,
        outletId,
        saleLines.map((line) => ({
          menuItemId: line.menuItemId,
          quantityDelta: -line.quantity,
          quantityAfter: after.get(line.menuItemId)!,
          reason: 'SALE' as const,
          saleId,
          note: null,
          createdBy: auth.userId,
        })),
      );
      return (await repo.findSale(client, outletId, saleId))!;
    });
    return { sale: withCurrency(sale), replayed: false };
  } catch (error) {
    // Two requests with the same key raced: the loser's insert hit the unique index. Answer like a retry.
    const pgError = error as { code?: string; constraint?: string };
    if (
      idempotencyKey &&
      pgError.code === '23505' &&
      pgError.constraint === 'sales_outlet_idempotency_key'
    ) {
      const previous = await replay(outletId, idempotencyKey, requestHash!);
      if (previous) return { sale: previous, replayed: true };
    }
    throw error;
  }
}

export async function getSale(outletId: string, saleId: string) {
  const sale = await repo.findSale(pool, outletId, saleId);
  if (!sale) throw new NotFoundError('Sale');
  return withCurrency(sale);
}

export async function listSales(
  outletId: string,
  filter: { limit: number; offset: number; from?: string; to?: string },
) {
  const { items, total } = await repo.listSales(pool, outletId, filter);
  return { items: items.map(withCurrency), total };
}

import { createHash } from 'node:crypto';
import { UnprocessableError } from '../../lib/errors';
import { MAX_LINE_QUANTITY } from './sales.schemas';

export interface RequestedLine {
  menuItemId: string;
  quantity: number;
}

/**
 * The same item twice in one sale becomes one line, so the stock check and the receipt see one quantity. Lines come
 * back sorted by id: the order the stock rows are locked in.
 */
export function mergeLines(items: RequestedLine[]): RequestedLine[] {
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(item.menuItemId, (quantities.get(item.menuItemId) ?? 0) + item.quantity);
  }
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

/**
 * Fingerprint of what was asked for (merged lines, payment, note), so a reused Idempotency-Key with a different sale
 * can be refused. Lines must already be merged, so the same sale written two ways hashes the same.
 */
export function hashSaleRequest(
  lines: RequestedLine[],
  input: { paymentMethod: string; note: string | null },
): string {
  return createHash('sha256')
    .update(JSON.stringify({ lines, paymentMethod: input.paymentMethod, note: input.note }))
    .digest('hex');
}

/** `ORCHARD-000042`: the outlet code and the per-outlet number, padded so receipts sort as text. */
export const formatReceiptNumber = (outletCode: string, seq: number) =>
  `${outletCode}-${String(seq).padStart(6, '0')}`;

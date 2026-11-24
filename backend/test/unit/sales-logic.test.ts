import { describe, expect, it } from 'vitest';
import {
  formatReceiptNumber,
  hashSaleRequest,
  mergeLines,
} from '../../src/modules/sales/sales.logic';
import { UnprocessableError } from '../../src/lib/errors';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

describe('mergeLines', () => {
  it('merges repeated items into one line and sorts by id (the lock order)', () => {
    expect(
      mergeLines([
        { menuItemId: B, quantity: 1 },
        { menuItemId: A, quantity: 2 },
        { menuItemId: B, quantity: 3 },
      ]),
    ).toEqual([
      { menuItemId: A, quantity: 2 },
      { menuItemId: B, quantity: 4 },
    ]);
  });

  it('accepts exactly the per-item maximum', () => {
    expect(mergeLines([{ menuItemId: A, quantity: 999 }])).toEqual([
      { menuItemId: A, quantity: 999 },
    ]);
  });

  it('refuses a merged quantity above the maximum, naming the item', () => {
    let error: unknown;
    try {
      mergeLines([
        { menuItemId: A, quantity: 500 },
        { menuItemId: A, quantity: 500 },
      ]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(UnprocessableError);
    expect(error).toMatchObject({
      status: 422,
      code: 'LINE_QUANTITY_TOO_HIGH',
      details: [{ menuItemId: A, quantity: 1000 }],
    });
  });
});

describe('hashSaleRequest', () => {
  const base = { paymentMethod: 'CASH', note: null };

  it('gives the same hash for the same sale written two ways', () => {
    const one = mergeLines([
      { menuItemId: A, quantity: 1 },
      { menuItemId: A, quantity: 1 },
      { menuItemId: B, quantity: 1 },
    ]);
    const two = mergeLines([
      { menuItemId: B, quantity: 1 },
      { menuItemId: A, quantity: 2 },
    ]);
    expect(hashSaleRequest(one, base)).toBe(hashSaleRequest(two, base));
  });

  it('changes when a quantity, the payment method or the note changes', () => {
    const lines = [{ menuItemId: A, quantity: 1 }];
    const hash = hashSaleRequest(lines, base);
    expect(hashSaleRequest([{ menuItemId: A, quantity: 2 }], base)).not.toBe(hash);
    expect(hashSaleRequest(lines, { ...base, paymentMethod: 'CARD' })).not.toBe(hash);
    expect(hashSaleRequest(lines, { ...base, note: 'x' })).not.toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('formatReceiptNumber', () => {
  it('pads the number to six digits after the outlet code', () => {
    expect(formatReceiptNumber('ORCHARD', 1)).toBe('ORCHARD-000001');
    expect(formatReceiptNumber('MARINA', 123456)).toBe('MARINA-123456');
  });

  it('keeps counting past six digits instead of wrapping', () => {
    expect(formatReceiptNumber('MARINA', 1234567)).toBe('MARINA-1234567');
  });
});

import { describe, expect, it } from 'vitest';
import { cartItemCount, cartReducer, cartTotalCents, type CartLine } from './cart';

const latte = { menuItemId: 'a', name: 'Latte', unitPriceCents: 1200, maxQuantity: 2 };
const tea = { menuItemId: 'b', name: 'Tea', unitPriceCents: 600, maxQuantity: 10 };

describe('cart', () => {
  it('adds items and increments up to the stock on hand', () => {
    let cart: CartLine[] = [];
    cart = cartReducer(cart, { type: 'add', item: latte });
    cart = cartReducer(cart, { type: 'add', item: latte });
    cart = cartReducer(cart, { type: 'add', item: latte });
    cart = cartReducer(cart, { type: 'add', item: tea });
    expect(cart.map((line) => [line.menuItemId, line.quantity])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
    expect(cartTotalCents(cart)).toBe(2 * 1200 + 600);
    expect(cartItemCount(cart)).toBe(3);
  });

  it('does not add an item with no stock', () => {
    expect(cartReducer([], { type: 'add', item: { ...latte, maxQuantity: 0 } })).toEqual([]);
  });

  it('sets, caps, removes at zero and clears', () => {
    let cart = cartReducer([], { type: 'add', item: tea });
    cart = cartReducer(cart, { type: 'set', menuItemId: 'b', quantity: 99 });
    expect(cart[0]?.quantity).toBe(10);
    cart = cartReducer(cart, { type: 'set', menuItemId: 'b', quantity: 0 });
    expect(cart).toEqual([]);
    cart = cartReducer(cartReducer(cart, { type: 'add', item: tea }), { type: 'clear' });
    expect(cart).toEqual([]);
  });

  it('takes the latest price and stock when the item is added again', () => {
    let cart = cartReducer([], { type: 'add', item: tea });
    cart = cartReducer(cart, {
      type: 'add',
      item: { ...tea, unitPriceCents: 700, maxQuantity: 1 },
    });
    expect(cart[0]).toMatchObject({ unitPriceCents: 700, quantity: 1 });
  });
});

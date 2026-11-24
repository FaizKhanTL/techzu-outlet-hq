export interface CartLine {
  menuItemId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  /** What is in stock now: the cart never asks for more. */
  maxQuantity: number;
}

export type CartAction =
  | { type: 'add'; item: Omit<CartLine, 'quantity'> }
  | { type: 'set'; menuItemId: string; quantity: number }
  | { type: 'remove'; menuItemId: string }
  | { type: 'clear' };

/** The POS cart. Quantities stay between 1 and the stock on hand; a line set to 0 is removed. */
export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'add': {
      const existing = lines.find((line) => line.menuItemId === action.item.menuItemId);
      if (!existing)
        return action.item.maxQuantity > 0 ? [...lines, { ...action.item, quantity: 1 }] : lines;
      return lines.map((line) =>
        line === existing
          ? {
              ...line,
              ...action.item,
              quantity: Math.min(line.quantity + 1, action.item.maxQuantity),
            }
          : line,
      );
    }
    case 'set': {
      if (action.quantity <= 0)
        return lines.filter((line) => line.menuItemId !== action.menuItemId);
      return lines.map((line) =>
        line.menuItemId === action.menuItemId
          ? { ...line, quantity: Math.min(Math.floor(action.quantity), line.maxQuantity) }
          : line,
      );
    }
    case 'remove':
      return lines.filter((line) => line.menuItemId !== action.menuItemId);
    case 'clear':
      return [];
  }
}

export const cartTotalCents = (lines: CartLine[]) =>
  lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
export const cartItemCount = (lines: CartLine[]) =>
  lines.reduce((sum, line) => sum + line.quantity, 0);

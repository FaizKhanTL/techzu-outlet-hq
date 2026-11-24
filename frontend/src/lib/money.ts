/** Formats integer minor units (cents) as money in the deployment's currency. */
export function formatMoney(cents: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

/**
 * Reads what a person typed ("12", "12.5", "12.50") as cents. Returns null for anything that is not a non-negative
 * amount with at most two decimals, so a typo is never stored as a price.
 */
export function parseMoneyInput(input: string): number | null {
  const value = input.trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Cents as an editable string ("12.50"). */
export const centsToInput = (cents: number) => (cents / 100).toFixed(2);

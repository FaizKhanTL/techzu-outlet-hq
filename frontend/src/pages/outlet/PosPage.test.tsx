import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { PosPage } from './PosPage';
import { fakeApi, renderWithProviders } from '../../test/utils';

const item = (
  id: string,
  name: string,
  priceCents: number,
  stockQuantity: number,
  category = 'Coffee',
) => ({
  outletId: 'outlet-1',
  menuItemId: id,
  sku: id.toUpperCase(),
  name,
  description: null,
  category,
  basePriceCents: priceCents,
  priceOverrideCents: null,
  priceCents,
  isAvailable: true,
  menuItemIsActive: true,
  isSellable: true,
  stockQuantity,
});

const MENU = [
  item('latte', 'Latte', 1300, 2),
  item('tea', 'Teh Tarik', 600, 10, 'Tea'),
  item('mocha', 'Mocha', 1400, 0),
];

const sale = {
  id: 's1',
  outletId: 'outlet-1',
  receiptSeq: 7,
  receiptNumber: 'ORCHARD-000007',
  totalCents: 3200,
  itemCount: 3,
  paymentMethod: 'CARD',
  note: null,
  createdAt: '2026-11-24T10:00:00.000Z',
  currency: 'SGD',
  items: [],
};

const cartLines = () => screen.queryAllByRole('listitem');
/** The menu tile of an item (its name also shows in the cart once added). */
const tile = (name: string) => {
  const found = screen
    .getAllByRole('button')
    .find(
      (button) =>
        button.classList.contains('tile') &&
        button.querySelector('.tile-name')?.textContent === name,
    );
  if (!found) throw new Error(`No tile named ${name}`);
  return found as HTMLButtonElement;
};

describe('PosPage', () => {
  it('groups sellable items by category and marks sold-out ones', async () => {
    fakeApi(() => [200, { data: MENU }]);
    renderWithProviders(<PosPage />);
    expect(await screen.findByText('Latte')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Coffee' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tea' })).toBeTruthy();
    expect(tile('Mocha').disabled).toBe(true);
    expect(within(tile('Mocha')).getByText('Sold out')).toBeTruthy();
  });

  it('never puts more in the cart than is in stock', async () => {
    fakeApi(() => [200, { data: MENU }]);
    renderWithProviders(<PosPage />);
    await screen.findByText('Latte');
    fireEvent.click(tile('Latte'));
    fireEvent.click(tile('Latte'));
    expect(tile('Latte').disabled).toBe(true);
    expect(within(tile('Latte')).getByText('0 left')).toBeTruthy();
    expect(within(cartLines()[0]!).getByRole('button', { name: 'One more Latte' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('charges the cart with one Idempotency-Key, shows the receipt and clears the cart', async () => {
    const calls = fakeApi((method) =>
      method === 'POST' ? [201, { data: sale }] : [200, { data: MENU }],
    );
    renderWithProviders(<PosPage />);
    await screen.findByText('Latte');
    fireEvent.click(tile('Latte'));
    fireEvent.click(tile('Teh Tarik'));
    fireEvent.click(tile('Teh Tarik'));
    expect(screen.getByText(/Total · 3 items/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Card' }));
    fireEvent.click(screen.getByRole('button', { name: 'Charge' }));

    expect(await screen.findByText('ORCHARD-000007')).toBeTruthy();
    const post = calls.find((call) => call.method === 'POST')!;
    expect(post.path).toBe('/outlets/outlet-1/sales');
    expect(post.body).toEqual({
      items: [
        { menuItemId: 'latte', quantity: 1 },
        { menuItemId: 'tea', quantity: 2 },
      ],
      paymentMethod: 'CARD',
      note: null,
    });
    expect(post.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    fireEvent.click(screen.getByRole('button', { name: 'New sale' }));
    expect(cartLines()).toHaveLength(0);
  });

  it('retries a failed charge with the same key, and uses a new key once the cart changes', async () => {
    let attempt = 0;
    const calls = fakeApi((method) => {
      if (method !== 'POST') return [200, { data: MENU }];
      attempt += 1;
      return attempt === 1
        ? [503, { error: { code: 'BUSY', message: 'Please retry.' } }]
        : [201, { data: sale }];
    });
    renderWithProviders(<PosPage />);
    await screen.findByText('Latte');
    fireEvent.click(tile('Teh Tarik'));
    fireEvent.click(screen.getByRole('button', { name: 'Charge' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Please retry.');
    fireEvent.click(screen.getByRole('button', { name: 'Charge' }));
    await screen.findByText('ORCHARD-000007');

    const keys = calls
      .filter((call) => call.method === 'POST')
      .map((call) => call.headers['Idempotency-Key']);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);

    fireEvent.click(screen.getByRole('button', { name: 'New sale' }));
    fireEvent.click(tile('Teh Tarik'));
    fireEvent.click(screen.getByRole('button', { name: 'Charge' }));
    await waitFor(() => expect(calls.filter((call) => call.method === 'POST')).toHaveLength(3));
    expect(calls.filter((call) => call.method === 'POST')[2]!.headers['Idempotency-Key']).not.toBe(
      keys[0],
    );
  });

  it('shows the API reason when stock ran out meanwhile and reloads the menu', async () => {
    const calls = fakeApi((method) =>
      method === 'POST'
        ? [
            409,
            { error: { code: 'INSUFFICIENT_STOCK', message: 'Not enough stock for some items.' } },
          ]
        : [200, { data: MENU }],
    );
    renderWithProviders(<PosPage />);
    await screen.findByText('Latte');
    fireEvent.click(tile('Latte'));
    fireEvent.click(screen.getByRole('button', { name: 'Charge' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Not enough stock for some items.');
    await waitFor(() =>
      expect(calls.filter((call) => call.method === 'GET').length).toBeGreaterThanOrEqual(2),
    );
    expect(cartLines()).toHaveLength(1); // the cart is kept so the cashier can adjust it
  });
});

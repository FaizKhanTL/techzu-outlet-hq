import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { StockAdjustForm } from './StockAdjustForm';
import { fakeApi, renderWithProviders } from '../test/utils';

const setup = (current = 5) => {
  const calls = fakeApi(() => [201, { data: { quantity: 0 } }]);
  const onDone = vi.fn();
  renderWithProviders(
    <StockAdjustForm outletId="o1" menuItemId="m1" current={current} onDone={onDone} />,
  );
  const save = screen.getByRole('button', { name: 'Save' });
  const quantity = screen.getByLabelText('Quantity');
  const reason = screen.getByLabelText('Reason');
  return { calls, onDone, save, quantity, reason };
};

describe('StockAdjustForm', () => {
  it('sends waste as a negative delta and shows the stock after it', async () => {
    const { calls, onDone, save, quantity, reason } = setup(5);
    fireEvent.change(reason, { target: { value: 'WASTE' } });
    fireEvent.change(quantity, { target: { value: '2' } });
    expect(screen.getByText('Stock after: 3')).toBeTruthy();
    fireEvent.click(save);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/outlets/o1/inventory/m1/adjustments',
      body: { quantityDelta: -2, reason: 'WASTE', note: null },
    });
  });

  it('will not submit a removal larger than the stock', () => {
    const { save, quantity, reason, calls } = setup(2);
    fireEvent.change(reason, { target: { value: 'WASTE' } });
    fireEvent.change(quantity, { target: { value: '3' } });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save);
    expect(calls).toHaveLength(0);
  });

  it('will not submit zero or a fraction', () => {
    const { save, quantity } = setup();
    for (const value of ['0', '1.5', '']) {
      fireEvent.change(quantity, { target: { value } });
      expect((save as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('shows the message the API refused with', async () => {
    fakeApi(() => [
      409,
      { error: { code: 'INSUFFICIENT_STOCK', message: 'Only 1 in stock; cannot remove 2.' } },
    ]);
    renderWithProviders(
      <StockAdjustForm outletId="o1" menuItemId="m1" current={5} onDone={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Only 1 in stock; cannot remove 2.',
    );
  });
});

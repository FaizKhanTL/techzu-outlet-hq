import { useState, type FormEvent } from 'react';
import { useAdjustStock } from '../api/hooks';
import type { AdjustmentReason } from '../api/types';
import { ErrorBox } from './ui';

/** Restock, waste or correct one item's stock. The API refuses anything that would take stock below zero. */
export function StockAdjustForm({
  outletId,
  menuItemId,
  current,
  onDone,
}: {
  outletId: string;
  menuItemId: string;
  current: number;
  onDone: () => void;
}) {
  const adjust = useAdjustStock(outletId);
  const [reason, setReason] = useState<AdjustmentReason>('RESTOCK');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const quantity = Number(amount);
  const valid =
    Number.isInteger(quantity) && quantity !== 0 && (reason === 'CORRECTION' || quantity > 0);
  // Restock adds; waste removes; a correction is signed as typed.
  const delta = reason === 'RESTOCK' ? quantity : reason === 'WASTE' ? -quantity : quantity;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    adjust.mutate(
      { menuItemId, quantityDelta: delta, reason, note: note || null },
      { onSuccess: onDone },
    );
  };

  return (
    <form className="form" onSubmit={submit}>
      <p className="muted">In stock now: {current}</p>
      <ErrorBox error={adjust.error} />
      <label>
        Reason
        <select value={reason} onChange={(e) => setReason(e.target.value as AdjustmentReason)}>
          <option value="RESTOCK">Restock (add)</option>
          <option value="WASTE">Waste (remove)</option>
          <option value="CORRECTION">Correction (+ or −)</option>
        </select>
      </label>
      <label>
        Quantity
        <input
          type="number"
          step={1}
          min={reason === 'CORRECTION' ? undefined : 1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </label>
      {valid ? <p className="muted">Stock after: {current + delta}</p> : null}
      <label>
        Note
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </label>
      <div className="form-actions">
        <button type="button" className="secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" disabled={!valid || adjust.isPending || current + delta < 0}>
          {adjust.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

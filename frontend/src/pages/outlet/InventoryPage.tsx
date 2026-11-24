import { useState } from 'react';
import { useInventory } from '../../api/hooks';
import type { InventoryLine } from '../../api/types';
import { useUser } from '../../auth/context';
import { formatDateTime } from '../../lib/dates';
import { Badge, Empty, ErrorBox, Loading, Modal, PageHeader } from '../../components/ui';
import { StockAdjustForm } from '../../components/StockAdjustForm';

const LOW_STOCK = 10;

export function InventoryPage() {
  const { outletId } = useUser();
  const inventory = useInventory(outletId!);
  const [editing, setEditing] = useState<InventoryLine | null>(null);

  return (
    <>
      <PageHeader title="Inventory" subtitle="Stock on hand at this outlet" />
      <ErrorBox error={inventory.error} />
      {inventory.isPending ? (
        <Loading />
      ) : inventory.data?.length ? (
        <section className="card">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th className="num">In stock</th>
                <th>Last change</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {inventory.data.map((line) => (
                <tr key={line.menuItemId}>
                  <td>
                    {line.name} <small className="muted">{line.sku}</small>{' '}
                    {line.isAvailable ? null : <Badge tone="amber">Paused</Badge>}
                  </td>
                  <td>{line.category}</td>
                  <td className="num">
                    {line.quantity === 0 ? (
                      <Badge tone="red">0</Badge>
                    ) : line.quantity < LOW_STOCK ? (
                      <Badge tone="amber">{line.quantity}</Badge>
                    ) : (
                      line.quantity
                    )}
                  </td>
                  <td className="muted">{formatDateTime(line.updatedAt)}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="secondary small"
                      onClick={() => setEditing(line)}
                    >
                      Adjust
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <Empty>No items are assigned to this outlet yet.</Empty>
      )}
      {editing ? (
        <Modal title={`Stock of ${editing.name}`} onClose={() => setEditing(null)}>
          <StockAdjustForm
            outletId={outletId!}
            menuItemId={editing.menuItemId}
            current={editing.quantity}
            onDone={() => setEditing(null)}
          />
        </Modal>
      ) : null}
    </>
  );
}

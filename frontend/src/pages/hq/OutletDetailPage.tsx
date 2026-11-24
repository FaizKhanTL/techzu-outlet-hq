import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useAssignItem,
  useMenuItems,
  useOutlet,
  useOutletMenu,
  useUnassignItem,
} from '../../api/hooks';
import type { OutletMenuItem } from '../../api/types';
import { centsToInput, parseMoneyInput } from '../../lib/money';
import { Badge, Empty, ErrorBox, Loading, Modal, Money, PageHeader } from '../../components/ui';
import { StockAdjustForm } from '../../components/StockAdjustForm';

function PriceForm({
  outletId,
  item,
  onDone,
}: {
  outletId: string;
  item: OutletMenuItem;
  onDone: () => void;
}) {
  const assign = useAssignItem(outletId);
  const [value, setValue] = useState(
    item.priceOverrideCents === null ? '' : centsToInput(item.priceOverrideCents),
  );
  const cents = value.trim() === '' ? null : parseMoneyInput(value);
  const invalid = value.trim() !== '' && cents === null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (invalid) return;
    assign.mutate(
      { menuItemId: item.menuItemId, method: 'PATCH', priceOverrideCents: cents },
      { onSuccess: onDone },
    );
  };

  return (
    <form className="form" onSubmit={submit}>
      <ErrorBox error={assign.error} />
      <p className="muted">
        Master price: <Money cents={item.basePriceCents} />. Leave empty to sell at the master
        price.
      </p>
      <label>
        Outlet price
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={centsToInput(item.basePriceCents)}
        />
      </label>
      {invalid ? <p className="field-error">Enter an amount like 12.50</p> : null}
      <div className="form-actions">
        <button type="button" className="secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" disabled={invalid || assign.isPending}>
          Save
        </button>
      </div>
    </form>
  );
}

function AssignForm({
  outletId,
  assigned,
  onDone,
}: {
  outletId: string;
  assigned: Set<string>;
  onDone: () => void;
}) {
  const master = useMenuItems({ isActive: true });
  const assign = useAssignItem(outletId);
  const [menuItemId, setMenuItemId] = useState('');
  const [price, setPrice] = useState('');
  const options = (master.data?.data ?? []).filter((item) => !assigned.has(item.id));
  const cents = price.trim() === '' ? null : parseMoneyInput(price);
  const invalid = price.trim() !== '' && cents === null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!menuItemId || invalid) return;
    assign.mutate({ menuItemId, method: 'PUT', priceOverrideCents: cents }, { onSuccess: onDone });
  };

  if (master.isPending) return <Loading />;
  if (options.length === 0)
    return <Empty>Every active menu item is already on this outlet&apos;s menu.</Empty>;
  return (
    <form className="form" onSubmit={submit}>
      <ErrorBox error={assign.error ?? master.error} />
      <label>
        Menu item
        <select value={menuItemId} onChange={(e) => setMenuItemId(e.target.value)} required>
          <option value="">Choose…</option>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.category} · {item.name} ({centsToInput(item.basePriceCents)})
            </option>
          ))}
        </select>
      </label>
      <label>
        Outlet price <small className="muted">(optional; empty = master price)</small>
        <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      {invalid ? <p className="field-error">Enter an amount like 12.50</p> : null}
      <div className="form-actions">
        <button type="button" className="secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" disabled={!menuItemId || invalid || assign.isPending}>
          Assign
        </button>
      </div>
    </form>
  );
}

type Dialog =
  | { kind: 'assign' }
  | { kind: 'price'; item: OutletMenuItem }
  | { kind: 'stock'; item: OutletMenuItem };

export function OutletDetailPage() {
  const { outletId = '' } = useParams();
  const outlet = useOutlet(outletId);
  const menu = useOutletMenu(outletId);
  const availability = useAssignItem(outletId);
  const unassign = useUnassignItem(outletId);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const assigned = useMemo(
    () => new Set((menu.data ?? []).map((item) => item.menuItemId)),
    [menu.data],
  );

  if (outlet.isPending) return <Loading />;
  if (outlet.error || !outlet.data)
    return <ErrorBox error={outlet.error ?? new Error('Outlet not found')} />;

  return (
    <>
      <p className="breadcrumb">
        <Link to="/hq/outlets">Outlets</Link> / {outlet.data.code}
      </p>
      <PageHeader
        title={outlet.data.name}
        subtitle={
          <>
            {outlet.data.code} · {outlet.data.address ?? 'No address'}{' '}
            {outlet.data.isActive ? null : <Badge tone="grey">Inactive</Badge>}
          </>
        }
        actions={
          <button type="button" onClick={() => setDialog({ kind: 'assign' })}>
            Assign menu item
          </button>
        }
      />
      <ErrorBox error={menu.error ?? availability.error ?? unassign.error} />
      {menu.isPending ? (
        <Loading />
      ) : menu.data?.length ? (
        <section className="card">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th className="num">Price</th>
                <th className="num">Stock</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {menu.data.map((item) => (
                <tr key={item.menuItemId}>
                  <td>
                    {item.name} <small className="muted">{item.sku}</small>
                  </td>
                  <td>{item.category}</td>
                  <td className="num">
                    <Money cents={item.priceCents} />
                    {item.priceOverrideCents !== null ? (
                      <small className="muted"> (override)</small>
                    ) : null}
                  </td>
                  <td className="num">{item.stockQuantity}</td>
                  <td>
                    {!item.menuItemIsActive ? (
                      <Badge tone="red">Retired</Badge>
                    ) : item.isAvailable ? (
                      <Badge tone="green">Selling</Badge>
                    ) : (
                      <Badge tone="amber">Paused</Badge>
                    )}
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="secondary small"
                      onClick={() => setDialog({ kind: 'price', item })}
                    >
                      Price
                    </button>
                    <button
                      type="button"
                      className="secondary small"
                      onClick={() => setDialog({ kind: 'stock', item })}
                    >
                      Stock
                    </button>
                    <button
                      type="button"
                      className="secondary small"
                      disabled={availability.isPending}
                      onClick={() =>
                        availability.mutate({
                          menuItemId: item.menuItemId,
                          method: 'PATCH',
                          isAvailable: !item.isAvailable,
                        })
                      }
                    >
                      {item.isAvailable ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      className="danger small"
                      disabled={unassign.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove ${item.name} from ${outlet.data.code}? Its stock record goes too.`,
                          )
                        ) {
                          unassign.mutate(item.menuItemId);
                        }
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <Empty>Nothing is assigned to this outlet yet.</Empty>
      )}
      {dialog?.kind === 'assign' ? (
        <Modal title="Assign a menu item" onClose={() => setDialog(null)}>
          <AssignForm outletId={outletId} assigned={assigned} onDone={() => setDialog(null)} />
        </Modal>
      ) : null}
      {dialog?.kind === 'price' ? (
        <Modal title={`Price of ${dialog.item.name}`} onClose={() => setDialog(null)}>
          <PriceForm outletId={outletId} item={dialog.item} onDone={() => setDialog(null)} />
        </Modal>
      ) : null}
      {dialog?.kind === 'stock' ? (
        <Modal title={`Stock of ${dialog.item.name}`} onClose={() => setDialog(null)}>
          <StockAdjustForm
            outletId={outletId}
            menuItemId={dialog.item.menuItemId}
            current={dialog.item.stockQuantity}
            onDone={() => setDialog(null)}
          />
        </Modal>
      ) : null}
    </>
  );
}

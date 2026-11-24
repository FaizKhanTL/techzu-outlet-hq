import { useState, type FormEvent } from 'react';
import { useMenuItems, useSaveMenuItem } from '../../api/hooks';
import type { MenuItem } from '../../api/types';
import { centsToInput, parseMoneyInput } from '../../lib/money';
import { Badge, Empty, ErrorBox, Loading, Modal, Money, PageHeader } from '../../components/ui';

function MenuItemForm({ item, onDone }: { item?: MenuItem; onDone: () => void }) {
  const save = useSaveMenuItem();
  const [sku, setSku] = useState(item?.sku ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState(item?.category ?? 'General');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item ? centsToInput(item.basePriceCents) : '');
  const cents = parseMoneyInput(price);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (cents === null) return;
    const fields = { name, category, description: description || null, basePriceCents: cents };
    save.mutate(item ? { id: item.id, ...fields } : { sku, ...fields }, { onSuccess: onDone });
  };

  return (
    <form className="form" onSubmit={submit}>
      <ErrorBox error={save.error} />
      <label>
        SKU {item ? <small className="muted">(cannot change)</small> : null}
        <input
          value={sku}
          onChange={(e) => setSku(e.target.value.toUpperCase())}
          disabled={Boolean(item)}
          required
          pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,31}"
          title="2-32 letters, digits, dashes or underscores"
          placeholder="COF-LATTE"
        />
      </label>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
      </label>
      <label>
        Category
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
          maxLength={60}
        />
      </label>
      <label>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={2}
        />
      </label>
      <label>
        Master price
        <input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
          placeholder="12.50"
        />
      </label>
      {price && cents === null ? <p className="field-error">Enter an amount like 12.50</p> : null}
      <div className="form-actions">
        <button type="button" className="secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" disabled={cents === null || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

export function MenuPage() {
  const [search, setSearch] = useState('');
  const items = useMenuItems({ search: search || undefined });
  const toggle = useSaveMenuItem();
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Master menu"
        subtitle="Items HQ can assign to outlets"
        actions={
          <button type="button" onClick={() => setEditing('new')}>
            New item
          </button>
        }
      />
      <input
        className="search"
        placeholder="Search by SKU or name"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ErrorBox error={items.error ?? toggle.error} />
      {items.isPending ? (
        <Loading />
      ) : items.data?.data.length ? (
        <section className="card">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Category</th>
                <th className="num">Master price</th>
                <th className="num">Outlets</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.data.data.map((item) => (
                <tr key={item.id}>
                  <td className="mono">{item.sku}</td>
                  <td>{item.name}</td>
                  <td>{item.category}</td>
                  <td className="num">
                    <Money cents={item.basePriceCents} />
                  </td>
                  <td className="num">{item.assignedOutletCount}</td>
                  <td>
                    {item.isActive ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="grey">Retired</Badge>
                    )}
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="secondary small"
                      onClick={() => setEditing(item)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="secondary small"
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ id: item.id, isActive: !item.isActive })}
                    >
                      {item.isActive ? 'Retire' : 'Restore'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <Empty>No menu items yet.</Empty>
      )}
      {editing ? (
        <Modal
          title={editing === 'new' ? 'New menu item' : `Edit ${editing.name}`}
          onClose={() => setEditing(null)}
        >
          <MenuItemForm
            item={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        </Modal>
      ) : null}
    </>
  );
}

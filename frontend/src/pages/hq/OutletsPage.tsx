import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useOutlets, useSaveOutlet } from '../../api/hooks';
import type { Outlet } from '../../api/types';
import { Badge, Empty, ErrorBox, Loading, Modal, PageHeader } from '../../components/ui';

function OutletForm({ outlet, onDone }: { outlet?: Outlet; onDone: () => void }) {
  const save = useSaveOutlet();
  const [code, setCode] = useState(outlet?.code ?? '');
  const [name, setName] = useState(outlet?.name ?? '');
  const [address, setAddress] = useState(outlet?.address ?? '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(
      outlet
        ? { id: outlet.id, name, address: address || null }
        : { code, name, address: address || null },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={submit} className="form">
      <ErrorBox error={save.error} />
      <label>
        Code {outlet ? <small className="muted">(printed on receipts; cannot change)</small> : null}
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          disabled={Boolean(outlet)}
          required
          pattern="[A-Za-z0-9][A-Za-z0-9-]{1,15}"
          title="2-16 letters, digits or dashes"
          placeholder="KLCC"
        />
      </label>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
      </label>
      <label>
        Address
        <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />
      </label>
      <div className="form-actions">
        <button type="button" className="secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

export function OutletsPage() {
  const [search, setSearch] = useState('');
  const outlets = useOutlets({ search: search || undefined });
  const toggle = useSaveOutlet();
  const [editing, setEditing] = useState<Outlet | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Outlets"
        subtitle="Where the menu is sold"
        actions={
          <button type="button" onClick={() => setEditing('new')}>
            New outlet
          </button>
        }
      />
      <input
        className="search"
        placeholder="Search by code or name"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ErrorBox error={outlets.error ?? toggle.error} />
      {outlets.isPending ? (
        <Loading />
      ) : outlets.data?.data.length ? (
        <section className="card">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Address</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {outlets.data.data.map((outlet) => (
                <tr key={outlet.id}>
                  <td>
                    <Link to={`/hq/outlets/${outlet.id}`}>{outlet.code}</Link>
                  </td>
                  <td>{outlet.name}</td>
                  <td className="muted">{outlet.address ?? '—'}</td>
                  <td>
                    {outlet.isActive ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="grey">Inactive</Badge>
                    )}
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="secondary small"
                      onClick={() => setEditing(outlet)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="secondary small"
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ id: outlet.id, isActive: !outlet.isActive })}
                    >
                      {outlet.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <Empty>No outlets yet.</Empty>
      )}
      {editing ? (
        <Modal
          title={editing === 'new' ? 'New outlet' : `Edit ${editing.code}`}
          onClose={() => setEditing(null)}
        >
          <OutletForm
            outlet={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        </Modal>
      ) : null}
    </>
  );
}

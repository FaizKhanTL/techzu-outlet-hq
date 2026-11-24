import { NavLink, Outlet } from 'react-router-dom';
import { useAuth, useUser } from '../auth/context';
import { useOutlet } from '../api/hooks';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const HQ_LINKS: NavItem[] = [
  { to: '/hq', label: 'Dashboard', end: true },
  { to: '/hq/outlets', label: 'Outlets' },
  { to: '/hq/menu', label: 'Master menu' },
];

const OUTLET_LINKS: NavItem[] = [
  { to: '/outlet/pos', label: 'Point of sale' },
  { to: '/outlet/inventory', label: 'Inventory' },
  { to: '/outlet/sales', label: 'Sales' },
  { to: '/outlet/reports', label: 'Reports' },
];

function OutletName({ outletId }: { outletId: string }) {
  const { data } = useOutlet(outletId);
  return <>{data ? `${data.name} (${data.code})` : '…'}</>;
}

export function Layout() {
  const user = useUser();
  const { logout } = useAuth();
  const links = user.role === 'HQ_ADMIN' ? HQ_LINKS : OUTLET_LINKS;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          Outlet <strong>HQ</strong>
        </div>
        <div className="context">
          {user.role === 'HQ_ADMIN' ? 'Headquarters' : <OutletName outletId={user.outletId!} />}
        </div>
        <nav>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end ?? false}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user">
            <span>{user.fullName}</span>
            <small>{user.email}</small>
          </div>
          <button type="button" className="secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

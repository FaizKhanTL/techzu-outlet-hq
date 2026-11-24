import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth/context';
import type { Role } from './api/types';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { DashboardPage } from './pages/hq/DashboardPage';
import { OutletsPage } from './pages/hq/OutletsPage';
import { OutletDetailPage } from './pages/hq/OutletDetailPage';
import { MenuPage } from './pages/hq/MenuPage';
import { PosPage } from './pages/outlet/PosPage';
import { InventoryPage } from './pages/outlet/InventoryPage';
import { SalesPage } from './pages/outlet/SalesPage';
import { OutletReportsPage } from './pages/outlet/OutletReportsPage';

const homeFor = (role: Role) => (role === 'HQ_ADMIN' ? '/hq' : '/outlet/pos');

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Signing you in…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/hq"
        element={
          <RequireRole role="HQ_ADMIN">
            <Layout />
          </RequireRole>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="outlets" element={<OutletsPage />} />
        <Route path="outlets/:outletId" element={<OutletDetailPage />} />
        <Route path="menu" element={<MenuPage />} />
      </Route>
      <Route
        path="/outlet"
        element={
          <RequireRole role="OUTLET_STAFF">
            <Layout />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="pos" replace />} />
        <Route path="pos" element={<PosPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="reports" element={<OutletReportsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

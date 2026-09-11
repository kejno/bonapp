import type { CSSProperties } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';

function decodeTenantName(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { tenantName?: string };
    return payload.tenantName ?? '';
  } catch {
    return '';
  }
}

const sidebarStyle: CSSProperties = {
  width: 200,
  borderRight: '1px solid #e5e4e7',
  padding: '16px 0',
  flexShrink: 0,
};

const navLinkStyle: CSSProperties = {
  display: 'block',
  padding: '10px 16px',
  textDecoration: 'none',
  color: 'inherit',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 24px',
  borderBottom: '1px solid #e5e4e7',
};

export function AdminLayout() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token') ?? '';
  const tenantName = decodeTenantName(token);

  function handleLogout() {
    localStorage.removeItem('token');
    navigate('/login');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={sidebarStyle}>
        <Link to="/admin/menu" style={navLinkStyle}>Меню</Link>
        <Link to="/admin/tables" style={navLinkStyle}>Столы</Link>
        <Link to="/admin/orders" style={navLinkStyle}>Заказы</Link>
      </nav>
      <div style={{ flex: 1 }}>
        <header style={headerStyle}>
          <span>{tenantName}</span>
          <button type="button" onClick={handleLogout}>Выйти</button>
        </header>
        <main style={{ padding: 24 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

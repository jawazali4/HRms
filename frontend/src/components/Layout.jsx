import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, useRole } from '../context/AuthContext';

const NAV = [
  { to: '/', label: 'Dashboard', ico: '◫', roles: ['employee', 'manager', 'hr', 'admin'] },
  { to: '/employees', label: 'Employees', ico: '👥', roles: ['employee', 'manager', 'hr', 'admin'] },
  { to: '/attendance', label: 'Attendance', ico: '🕒', roles: ['employee', 'manager', 'hr', 'admin'] },
  { to: '/kiosk', label: 'Clock-In Kiosk', ico: '🖥️', roles: ['employee', 'manager', 'hr', 'admin', 'guest'] },
  { to: '/leave', label: 'Leave', ico: '🏖️', roles: ['employee', 'manager', 'hr', 'admin'] },
  { to: '/loans', label: 'Loans', ico: '💳', roles: ['employee', 'manager', 'hr', 'admin'] },
  { to: '/payroll', label: 'Payroll & Slips', ico: '💵', roles: ['hr', 'admin'] },
  { to: '/assets', label: 'Assets', ico: '📦', roles: ['employee', 'manager', 'hr', 'admin'] },
  { to: '/reports', label: 'Reports', ico: '📊', roles: ['employee', 'manager', 'hr', 'admin'] },
  { to: '/profile', label: 'My Profile', ico: '⚙️', roles: ['employee', 'manager', 'hr', 'admin'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const role = useRole();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const initials = (user?.employee?.fullNameEn || user?.email || 'U').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  const name = user?.employee?.fullNameEn || (user?.email || '').split('@')[0];
  const items = NAV.filter((n) => n.roles.includes(role));

  return (
    <div className="app">
      <div className={open ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <div className="logo">H</div>
          <div>
            <b>HRMS Saudi</b>
            <small>People · Payroll · Compliance</small>
          </div>
        </div>
        <nav className="nav">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')} onClick={() => setOpen(false)}>
              <span className="ico">{n.ico}</span> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidefoot">
          GOSI &amp; Saudi Labour Law ready · Demo system
          {loc.pathname !== '/kiosk' && (
            <div style={{ marginTop: 8 }}>
              <button className="btn ghost sm" style={{ color: '#0b2b2a', width: '100%' }} onClick={logout}>Sign out</button>
            </div>
          )}
        </div>
      </div>
      <div className="main">
        <div className="topbar">
          <button className="iconbtn mobile-only" onClick={() => setOpen(!open)}>☰</button>
          <span className="crumb">{items.find((i) => loc.pathname.startsWith(i.to) && i.to !== '/')?.label || 'Dashboard'}</span>
          <span className="spacer" />
          <div className="userchip">
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
              <small>{role} {user?.employee?.employeeCode ? `· ${user.employee.employeeCode}` : ''}</small>
            </div>
            <div className="avatar">{initials}</div>
          </div>
        </div>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

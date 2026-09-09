import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, useRole } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const NAV = [
  { to: '/', labelKey: 'nav.dashboard', ico: '📊', roles: ['employee', 'manager', 'hr', 'admin'], section: 'main' },
  { to: '/employees', labelKey: 'nav.employees', ico: '👥', roles: ['employee', 'manager', 'hr', 'admin'], section: 'main' },
  { to: '/branches', labelKey: 'nav.branches', ico: '🏢', roles: ['hr', 'admin'], section: 'main' },
  { to: '/shifts', labelKey: 'nav.shifts', ico: '⏰', roles: ['hr', 'admin'], section: 'main' },
  { to: '/attendance', labelKey: 'nav.attendance', ico: '🕒', roles: ['employee', 'manager', 'hr', 'admin'], section: 'main' },
  { to: '/leave', labelKey: 'nav.leave', ico: '🏖️', roles: ['employee', 'manager', 'hr', 'admin'], section: 'main' },
  { to: '/loans', labelKey: 'nav.loans', ico: '💳', roles: ['employee', 'manager', 'hr', 'admin'], section: 'main' },
  { to: '/payroll', labelKey: 'nav.payroll', ico: '💵', roles: ['hr', 'admin'], section: 'main' },
  { to: '/assets', labelKey: 'nav.assets', ico: '📦', roles: ['employee', 'manager', 'hr', 'admin'], section: 'main' },
  { to: '/reports', labelKey: 'nav.reports', ico: '📈', roles: ['employee', 'manager', 'hr', 'admin'], section: 'main' },
  { to: '/users', labelKey: 'nav.users', ico: '👑', roles: ['admin'], section: 'admin' },
  { to: '/kiosk', labelKey: 'nav.kiosk', ico: '🖥️', roles: ['employee', 'manager', 'hr', 'admin', 'guest'], section: 'tools' },
  { to: '/profile', labelKey: 'nav.profile', ico: '⚙️', roles: ['employee', 'manager', 'hr', 'admin'], section: 'tools' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const role = useRole();
  const { t, language, toggleLanguage, isRTL } = useLanguage();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  
  const initials = (user?.employee?.fullNameEn || user?.email || 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
    
  const name = user?.employee?.fullNameEn || (user?.email || '').split('@')[0];
  const items = NAV.filter((n) => n.roles.includes(role));

  const mainNav = items.filter(n => n.section === 'main');
  const adminNav = items.filter(n => n.section === 'admin');
  const toolsNav = items.filter(n => n.section === 'tools');

  const getLabel = (item) => t(item.labelKey);

  return (
    <div className="app">
      <div className={open ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <div className="logo">J</div>
          <div>
            <b>Jawaz' HRMS</b>
            <small>Human Resource Management</small>
          </div>
        </div>
        
        <nav className="nav">
          {mainNav.length > 0 && (
            <>
              <div className="nav-section">{isRTL ? 'الرئيسية' : 'Main'}</div>
              {mainNav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                  onClick={() => setOpen(false)}
                >
                  <span className="ico">{n.ico}</span> {getLabel(n)}
                </NavLink>
              ))}
            </>
          )}

          {adminNav.length > 0 && (
            <>
              <div className="nav-section">{isRTL ? 'الإدارة' : 'Administration'}</div>
              {adminNav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                  onClick={() => setOpen(false)}
                >
                  <span className="ico">{n.ico}</span> {getLabel(n)}
                </NavLink>
              ))}
            </>
          )}

          {toolsNav.length > 0 && (
            <>
              <div className="nav-section">{isRTL ? 'الأدوات' : 'Tools'}</div>
              {toolsNav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                  onClick={() => setOpen(false)}
                >
                  <span className="ico">{n.ico}</span> {getLabel(n)}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="sidefoot">
          <div style={{ fontSize: 11.5, lineHeight: 1.6, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #14b8a6, #0f766e)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 12 }}>JA</div>
              <div>
                <div style={{ color: '#e6f4f2', fontWeight: 700, fontSize: 12 }}>{t('ui.developedBy')} <b>Jawaz Ali</b></div>
                <div style={{ color: '#7faaa5', fontSize: 10 }}>{t('ui.itSupport')} · Derbn Trading</div>
              </div>
            </div>
            <div style={{ color: '#7faaa5', fontSize: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>📧 Jawaz2013@gmail.com</span>
              <span>📱 +966 53 961 8563</span>
              <span>📍 Saudi Arabia</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              className="btn ghost sm" 
              style={{ flex: 1, color: '#0b2b2a', background: '#fff', fontSize: 11 }} 
              onClick={toggleLanguage}
            >
              {language === 'en' ? '🇸🇦 العربية' : '🇺🇸 English'}
            </button>
            <button className="btn ghost sm" style={{ flex: 1, color: '#0b2b2a', background: 'rgba(255,255,255,0.9)' }} onClick={logout}>
              {t('ui.signOut')}
            </button>
          </div>
        </div>
      </div>

      <div className="main">
        <div className="topbar">
          <button className="iconbtn mobile-only" onClick={() => setOpen(!open)}>
            {open ? '✕' : '☰'}
          </button>
          <span className="crumb">
            {items.find((i) => loc.pathname === i.to)?.label ? getLabel(items.find((i) => loc.pathname === i.to)) : 
             items.find((i) => loc.pathname.startsWith(i.to) && i.to !== '/') ? getLabel(items.find((i) => loc.pathname.startsWith(i.to) && i.to !== '/')) : 
             t('nav.dashboard')}
          </span>
          <span className="spacer" />
          
          <div className="topbar-actions">
            <button className="lang-switch" onClick={toggleLanguage} title={t('ui.language')}>
              <span>{language === 'en' ? '🇸🇦' : '🇺🇸'}</span>
              <span>{language === 'en' ? 'العربية' : 'English'}</span>
            </button>
            
            <div className="userchip" title={`${name} (${role})`}>
              <div className="avatar">{initials}</div>
              <div style={{ textAlign: isRTL ? 'right' : 'left', minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{name}</div>
                <small style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  <span className={`badge role-${role}`} style={{ fontSize: 9, padding: '1px 6px' }}>{role}</span>
                  {user?.employee?.employeeCode && <span style={{ opacity: 0.7 }}>{user.employee.employeeCode}</span>}
                </small>
              </div>
            </div>
          </div>
        </div>
        
        <div className="content">
          <Outlet />
        </div>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div 
          className="mobile-only"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 80,
          }}
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}

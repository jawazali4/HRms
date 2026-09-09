import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useLanguage } from './context/LanguageContext';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Employees from './pages/Employees.jsx';
import Attendance from './pages/Attendance.jsx';
import Kiosk from './pages/Kiosk.jsx';
import Leave from './pages/Leave.jsx';
import Loans from './pages/Loans.jsx';
import Payroll from './pages/Payroll.jsx';
import Assets from './pages/Assets.jsx';
import Reports from './pages/Reports.jsx';
import Profile from './pages/Profile.jsx';
import Users from './pages/Users.jsx';
import Branches from './pages/Branches.jsx';
import Shifts from './pages/Shifts.jsx';

function Protected({ roles, children }) {
  const { user, initializing } = useAuth();
  const { t } = useLanguage();
  if (initializing) return <div className="loading">{t('common.loading')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="content" style={{ maxWidth: 900, margin: '60px auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2>Access restricted</h2>
          <p style={{ marginTop: 8, color: 'var(--muted)' }}>
            Your role (<b>{user.role}</b>) does not have permission to view this page.
          </p>
          <p className="muted" style={{ marginTop: 4 }}>
            Contact your administrator if you need access.
          </p>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/kiosk" element={<Kiosk />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="employees" element={<Employees />} />
        <Route path="branches" element={<Protected roles={['hr', 'admin']}><Branches /></Protected>} />
        <Route path="shifts" element={<Protected roles={['hr', 'admin']}><Shifts /></Protected>} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="leave" element={<Leave />} />
        <Route path="loans" element={<Loans />} />
        <Route path="payroll" element={<Protected roles={['hr', 'admin']}><Payroll /></Protected>} />
        <Route path="assets" element={<Assets />} />
        <Route path="reports" element={<Reports />} />
        <Route path="profile" element={<Profile />} />
        <Route path="users" element={<Protected roles={['admin']}><Users /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

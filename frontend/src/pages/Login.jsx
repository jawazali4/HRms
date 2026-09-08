import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      nav('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div style={{ display: 'grid', gap: 40, gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', width: '100%', maxWidth: 1000, alignItems: 'center' }}>
        <div className="login-hero">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: '#14b8a6', display: 'grid', placeItems: 'center', color: '#062e2a', fontWeight: 800, fontSize: 24 }}>J</div>
            <div>
              <h1 style={{ color: '#fff', fontSize: 30, margin: 0 }}>Jawaz' HRMS</h1>
              <div style={{ opacity: 0.8 }}>Human Resource Management System</div>
            </div>
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.6, marginTop: 18 }}>
            Employees, attendance, payroll, loans, leave and assets in one system —
            built for <b>Saudi Labour Law</b> with <b>GOSI</b> contributions, pay-slip PDFs
            and automatic email delivery.
          </p>
          <p style={{ opacity: 0.85, fontSize: 13 }}>
            Office kiosk clock-in/out is available at the <b>Clock-In Kiosk</b> screen without signing in.
          </p>

          {/* Developer information */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', padding: '13px 15px', borderRadius: 14, marginTop: 26 }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#0d9488', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 17, flexShrink: 0 }}>JA</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700 }}>Jawaz Ali</div>
              <div style={{ color: '#bfe3df', fontSize: 12.5 }}>
                IT Support Specialist — Derbn Trading (شركة دربن التجارية)
              </div>
              <div style={{ color: '#9cc9c4', fontSize: 11.5, marginTop: 3 }}>
                📧 Jawaz2013@gmail.com &nbsp;·&nbsp; 📱 +966 53 961 8563 &nbsp;·&nbsp; 📍 Saudi Arabia
              </div>
            </div>
          </div>
        </div>

        <div className="login-card">
          <h1>Sign in</h1>
          <p className="muted" style={{ marginTop: 2 }}>
            Enter the email and password provided by your HR department.
          </p>
          {error && <div className="form-error">{error}</div>}
          <form onSubmit={submit}>
            <label className="f">
              <span>Email</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.sa" required autoComplete="username" />
            </label>
            <label className="f">
              <span>Password</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required autoComplete="current-password" />
            </label>
            <button className="btn block lg" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <p className="note" style={{ textAlign: 'center', marginTop: 14 }}>
            Forgot your password? Contact your HR administrator.
          </p>
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 16, paddingTop: 12, textAlign: 'center' }}>
            <small className="muted">
              Jawaz' HRMS v1.0 — developed &amp; maintained by Jawaz Ali
            </small>
          </div>
        </div>
      </div>
    </div>
  );
}

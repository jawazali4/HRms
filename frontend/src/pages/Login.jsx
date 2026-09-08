import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const DEMOS = [
  { label: 'HR Manager', sub: 'ahlam@alnoor.sa', email: 'ahlam@alnoor.sa' },
  { label: 'Operations Mgr', sub: 'khalid@alnoor.sa', email: 'khalid@alnoor.sa' },
  { label: 'Employee (hourly)', sub: 'sara@alnoor.sa', email: 'sara@alnoor.sa' },
  { label: 'Employee (commission)', sub: 'omar@alnoor.sa', email: 'omar@alnoor.sa' },
  { label: 'Employee (salaried)', sub: 'noura@alnoor.sa', email: 'noura@alnoor.sa' },
  { label: 'Admin', sub: 'admin@alnoor.sa', email: 'admin@alnoor.sa' },
];

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

  const quick = async (demoEmail) => {
    setBusy(true);
    setError('');
    try {
      await login(demoEmail, 'Demo@1234');
      nav('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div style={{ display: 'grid', gap: 40, gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', width: '100%', maxWidth: 1000, alignItems: 'center' }}>
        <div className="login-hero">
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#14b8a6', display: 'grid', placeItems: 'center', color: '#062e2a', fontWeight: 800, fontSize: 24 }}>H</div>
          <h1 style={{ color: '#fff', fontSize: 34, margin: '16px 0 10px' }}>HRMS Saudi Arabia</h1>
          <p style={{ fontSize: 15.5, lineHeight: 1.6 }}>
            Employees, attendance, payroll, loans, leave and assets in one system —
            built for <b>Saudi Labour Law</b> with <b>GOSI</b> contributions, pay-slip PDFs
            and automatic email delivery.
          </p>
          <p style={{ opacity: 0.8, fontSize: 13 }}>
            Kiosk clock-in/out is available at the <b>Clock-In Kiosk</b> page without a login.
          </p>
        </div>
        <div className="login-card">
          <h1>Sign in</h1>
          <p className="muted" style={{ marginTop: 2 }}>
            Use the demo password <b>Demo@1234</b> or click an account below.
          </p>
          {error && <div className="form-error">{error}</div>}
          <form onSubmit={submit}>
            <label className="f">
              <span>Email</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.sa" required />
            </label>
            <label className="f">
              <span>Password</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </label>
            <button className="btn block lg" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <div className="demo-btns">
            {DEMOS.map((d) => (
              <button key={d.email} className="btn ghost" type="button" disabled={busy} onClick={() => quick(d.email)}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.label}
                  <small style={{ display: 'block' }}>{d.sub}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

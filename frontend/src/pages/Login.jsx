import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { get } from '../api';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dbStatus, setDbStatus] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  if (user) return <Navigate to="/" replace />;

  // Check DB health on mount
  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        if (!cancelled) {
          setDbStatus(data);
        }
      } catch (e) {
        if (!cancelled) {
          setDbStatus({ ok: false, error: e.message });
        }
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      nav('/');
    } catch (err) {
      let msg = err.message || 'Login failed';
      
      // Special handling for database starting errors
      if (err.code === 'DB_INIT' || err.status === 503) {
        msg = 'Database is warming up — this happens on the first visit after deploy. Please wait 10-15 seconds and try again.';
        if (retryCount < 3) {
          setRetryCount((c) => c + 1);
          setTimeout(() => {
            setError('');
            setBusy(false);
          }, 3000);
        }
      } else if (err.code === 'DB_HOST_UNREACHABLE') {
        msg = err.message;
      } else if (err.code === 'DB_AUTH') {
        msg = err.message;
      }
      
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const isDbWarmingUp = dbStatus && !dbStatus.ok && dbStatus.code === 'DB_INIT';

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

          {/* DB Status indicator */}
          {dbStatus && (
            <div style={{ 
              marginTop: 20, 
              padding: '10px 14px', 
              borderRadius: 10, 
              fontSize: 12.5,
              background: dbStatus.ok ? 'rgba(20,184,166,0.15)' : 'rgba(251,191,36,0.15)',
              border: `1px solid ${dbStatus.ok ? 'rgba(20,184,166,0.3)' : 'rgba(251,191,36,0.3)'}`,
              color: dbStatus.ok ? '#5eead4' : '#fde68a'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ 
                  width: 8, 
                  height: 8, 
                  borderRadius: '50%', 
                  background: dbStatus.ok ? '#14b8a6' : '#f59e0b',
                  display: 'inline-block'
                }}></span>
                <span>
                  {dbStatus.ok ? 'System ready' : 'System warming up...'} 
                  {dbStatus.dialect && ` (${dbStatus.dialect})`}
                </span>
              </div>
              {!dbStatus.ok && dbStatus.error && (
                <div style={{ marginTop: 6, fontSize: 11, opacity: 0.8 }}>
                  {dbStatus.error.slice(0, 200)}
                </div>
              )}
            </div>
          )}

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

          {/* Demo accounts */}
          <div style={{ marginTop: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Demo Accounts (password: Demo@1234)</div>
            <div style={{ fontSize: 11.5, lineHeight: 1.6, color: '#cbd5e1' }}>
              <div><b>Admin:</b> admin@alnoor.sa</div>
              <div><b>HR:</b> ahlam@alnoor.sa</div>
              <div><b>Manager:</b> khalid@alnoor.sa</div>
              <div><b>Employee:</b> sara@alnoor.sa</div>
            </div>
          </div>
        </div>

        <div className="login-card">
          <h1>Sign in</h1>
          <p className="muted" style={{ marginTop: 2 }}>
            Enter the email and password provided by your HR department.
          </p>
          {error && (
            <div className="form-error" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {error}
              {(error.includes('warming up') || error.includes('still starting')) && (
                <div style={{ marginTop: 10 }}>
                  <button 
                    type="button"
                    onClick={() => { setError(''); setRetryCount(0); }}
                    style={{ 
                      background: '#0f766e', 
                      color: 'white', 
                      border: 'none', 
                      padding: '6px 12px', 
                      borderRadius: 6, 
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    Retry now
                  </button>
                  <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.7 }}>
                    Auto-retry in 3s...
                  </span>
                </div>
              )}
            </div>
          )}
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

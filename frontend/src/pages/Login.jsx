import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function Login() {
  const { user, login } = useAuth();
  const { t, language, toggleLanguage, isRTL } = useLanguage();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dbStatus, setDbStatus] = useState(null);

  if (user) return <Navigate to="/" replace />;

  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        if (!cancelled) setDbStatus(data);
      } catch (e) {
        if (!cancelled) setDbStatus({ ok: false, error: e.message });
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
      if (err.code === 'DB_INIT' || err.status === 503) {
        msg = isRTL
          ? 'قاعدة البيانات قيد التشغيل — يحدث هذا في أول زيارة بعد النشر. انتظر 10-15 ثانية وحاول مرة أخرى.'
          : 'Database is warming up — this happens on the first visit after deploy. Please wait 10-15 seconds and try again.';
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
        <button className="lang-switch" onClick={toggleLanguage} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}>
          <span>{language === 'en' ? '🇸🇦' : '🇺🇸'}</span>
          <span>{language === 'en' ? 'العربية' : 'English'}</span>
        </button>
      </div>

      <div className="login-container">
        <div className="login-hero">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #14b8a6, #0f766e)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 26, boxShadow: '0 8px 24px rgba(20,184,166,0.4)' }}>J</div>
            <div>
              <h1 style={{ color: '#fff', fontSize: 32, margin: 0, fontWeight: 800, letterSpacing: '-0.02em' }}>Jawaz' HRMS</h1>
              <div style={{ opacity: 0.85, fontSize: 13, fontWeight: 500, letterSpacing: '0.02em' }}>
                {isRTL ? 'نظام إدارة الموارد البشرية' : 'Human Resource Management System'}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 24, padding: '20px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, backdropFilter: 'blur(10px)' }}>
            <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0, color: '#e0f2f1' }}>
              {isRTL
                ? 'الموظفون والحضور والرواتب والقروض والإجازات والأصول في نظام واحد — مبني لـ '
                : 'Employees, attendance, payroll, loans, leave and assets in one system — built for '}
              <b style={{ color: '#5eead4' }}>{isRTL ? 'نظام العمل السعودي' : 'Saudi Labour Law'}</b>
              {isRTL ? ' مع ' : ' with '}
              <b style={{ color: '#5eead4' }}>GOSI</b>
              {isRTL ? ' وكشوف رواتب PDF وإرسال تلقائي بالبريد' : ' contributions, pay-slip PDFs and automatic email delivery.'}
            </p>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="chip" style={{ background: 'rgba(20,184,166,0.15)', color: '#5eead4', borderColor: 'rgba(20,184,166,0.2)' }}>🇸🇦 {isRTL ? 'متوافق مع السعودية' : 'Saudi Compliant'}</span>
              <span className="chip" style={{ background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', borderColor: 'rgba(255,255,255,0.1)' }}>⚡ {isRTL ? 'سريع' : 'Fast'}</span>
              <span className="chip" style={{ background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', borderColor: 'rgba(255,255,255,0.1)' }}>🔒 {isRTL ? 'آمن' : 'Secure'}</span>
            </div>
          </div>

          {dbStatus && (
            <div style={{
              marginTop: 16,
              padding: '12px 16px',
              borderRadius: 12,
              fontSize: 12.5,
              background: dbStatus.ok ? 'rgba(20,184,166,0.12)' : 'rgba(251,191,36,0.12)',
              border: `1px solid ${dbStatus.ok ? 'rgba(20,184,166,0.25)' : 'rgba(251,191,36,0.25)'}`,
              color: dbStatus.ok ? '#5eead4' : '#fde68a',
              backdropFilter: 'blur(10px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: dbStatus.ok ? '#14b8a6' : '#f59e0b', display: 'inline-block', boxShadow: `0 0 8px ${dbStatus.ok ? '#14b8a6' : '#f59e0b'}` }}></span>
                <span style={{ fontWeight: 600 }}>{dbStatus.ok ? (isRTL ? 'النظام جاهز' : 'System ready') : (isRTL ? 'النظام قيد التشغيل...' : 'System warming up...')} {dbStatus.dialect && `(${dbStatus.dialect})`}</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', padding: '14px 16px', borderRadius: 16, marginTop: 20, backdropFilter: 'blur(10px)' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #14b8a6, #0d9488)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 16, flexShrink: 0, boxShadow: '0 4px 12px rgba(20,184,166,0.3)' }}>JA</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{isRTL ? 'جواز علي' : 'Jawaz Ali'}</div>
              <div style={{ color: '#9cc9c4', fontSize: 11.5, marginTop: 2 }}>
                {isRTL ? 'أخصائي دعم تقني — شركة دربن التجارية' : 'IT Support Specialist — Derbn Trading (شركة دربن التجارية)'}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 16px', backdropFilter: 'blur(10px)' }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🔑</span> {isRTL ? 'حسابات تجريبية (كلمة المرور: Demo@1234)' : 'Demo Accounts (password: Demo@1234)'}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.8, color: '#cbd5e1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
              <div><b style={{ color: '#5eead4' }}>👑 Admin:</b> admin@alnoor.sa</div>
              <div><b style={{ color: '#5eead4' }}>👩‍💼 HR:</b> ahlam@alnoor.sa</div>
              <div><b style={{ color: '#5eead4' }}>👨‍💼 Manager:</b> khalid@alnoor.sa</div>
              <div><b style={{ color: '#5eead4' }}>👷 Employee:</b> sara@alnoor.sa</div>
            </div>
          </div>
        </div>

        <div className="login-card">
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h1 style={{ fontSize: 28 }}>{isRTL ? 'تسجيل الدخول' : t('auth.signIn')}</h1>
            <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>
              {isRTL ? 'أدخل البريد وكلمة المرور المقدمة من الموارد البشرية' : 'Enter the email and password provided by your HR department.'}
            </p>
          </div>

          {error && <div className="form-error" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error}</div>}

          <form onSubmit={submit}>
            <label className="f">
              <span>{isRTL ? 'البريد الإلكتروني' : t('auth.email')}</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.sa" required autoComplete="username" style={{ padding: '12px 14px', fontSize: 15 }} />
            </label>
            <label className="f">
              <span>{isRTL ? 'كلمة المرور' : t('auth.password')}</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isRTL ? 'أدخل كلمة المرور' : 'Enter your password'} required autoComplete="current-password" style={{ padding: '12px 14px', fontSize: 15 }} />
            </label>
            <button className="btn block lg" disabled={busy} style={{ marginTop: 8, background: 'var(--primary-gradient)', border: 'none', boxShadow: '0 4px 16px rgba(15,118,110,0.3)' }}>
              {busy ? (isRTL ? 'جاري تسجيل الدخول...' : 'Signing in…') : (isRTL ? 'تسجيل الدخول' : t('auth.signIn'))}
            </button>
          </form>

          <div style={{ marginTop: 20, padding: '12px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--line-light)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-light)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>💡</span> {isRTL ? 'نصيحة سريعة' : 'Quick Tip'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              {isRTL
                ? 'كمسؤول، يمكنك إدارة جميع الموظفين، حذفهم، تغيير أدوارهم، وإدارة المستخدمين من لوحة التحكم.'
                : 'As admin, you can manage all employees, delete them, change their roles, and manage users from dashboard.'}
            </div>
          </div>

          <p className="note" style={{ textAlign: 'center', marginTop: 16 }}>
            {t('auth.forgotPassword')}
          </p>

          <div style={{ borderTop: '1px solid var(--line)', marginTop: 20, paddingTop: 14, textAlign: 'center' }}>
            <small className="muted" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span>🇸🇦</span> Jawaz' HRMS v2.0 — {isRTL ? 'مطور بواسطة جواز علي' : 'developed by Jawaz Ali'} — {isRTL ? 'متوافق مع نظام العمل السعودي' : 'Saudi Labour Law Compliant'}
            </small>
          </div>
        </div>
      </div>
    </div>
  );
}

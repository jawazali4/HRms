import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../context/AuthContext';
import { Loader, Badge, fmtMoney, fmtDate, monthName } from '../components/ui';

export default function Profile() {
  const { user, logout } = useAuth();
  const role = useRole();
  const [me, setMe] = useState(null);
  const [slips, setSlips] = useState(null);
  const [assets, setAssets] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pin, setPin] = useState('');

  const load = useCallback(() => {
    Promise.all([
      api('GET', '/api/auth/me'),
      api('GET', '/api/payroll/payslips?limit=100'),
      api('GET', '/api/assets/mine'),
    ])
      .then(([m, p, a]) => {
        setMe(m);
        setSlips(p.payslips);
        setAssets(a.assets);
      })
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  const changePassword = async (e) => {
    e.preventDefault();
    setMsg(''); setErr('');
    if (pw.newPassword !== pw.confirm) return setErr('New passwords do not match.');
    try {
      await api('PUT', '/api/auth/password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      setMsg('Password changed. Please sign in again with the new password.');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      setTimeout(() => logout(), 1200);
    } catch (ex) {
      setErr(ex.message);
    }
  };

  const savePin = async (e) => {
    e.preventDefault();
    setMsg(''); setErr('');
    try {
      await api('PUT', '/api/auth/my-pin', { pin: Number(pin) });
      setMsg('Kiosk PIN updated — you can clock in/out at the kiosk with your employee code + this PIN.');
      setPin('');
    } catch (ex) {
      setErr(ex.message);
    }
  };

  if (!me) return <Loader />;

  const emp = me.user.employee;
  const b = me.balances;

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>My profile</h1>
          <p>Personal details, security settings and pay-slip history.</p>
        </div>
      </div>

      {msg && <div className="form-ok">{msg}</div>}
      {err && <div className="error-box">{err}</div>}

      <div className="grid2">
        <div>
          <div className="card">
            <h3>My employee record</h3>
            {emp ? (
              <>
                <div className="listitem"><span>Name</span><b>{emp.fullNameEn} ({emp.employeeCode})</b></div>
                <div className="listitem"><span>Role in system</span><Badge value={`role-${role}`} /></div>
                <div className="listitem"><span>Department</span><b>{emp.department || '—'}</b></div>
                <div className="listitem"><span>Job title</span><b>{emp.jobTitle || '—'}</b></div>
                <div className="note">Email: {me.user.email}</div>
              </>
            ) : (
              <p className="muted">Admin account — no employee record linked.</p>
            )}
          </div>

          <div className="card">
            <h3>Kiosk PIN</h3>
            <form onSubmit={savePin}>
              <label className="f"><span>4-digit clock-in PIN</span>
                <input className="input" type="password" maxLength={4} inputMode="numeric" value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
              </label>
              <button className="btn sm">Save PIN</button>
            </form>
            <div className="note">At the office kiosk you press your name, type this PIN, then Clock IN / OUT.</div>
          </div>

          <div className="card">
            <h3>Change password</h3>
            <form onSubmit={changePassword}>
              <label className="f"><span>Current password</span>
                <input className="input" type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required /></label>
              <label className="f"><span>New password (8+ characters)</span>
                <input className="input" type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required /></label>
              <label className="f"><span>Repeat new password</span>
                <input className="input" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></label>
              <button className="btn sm ghost">Change password</button>
            </form>
          </div>
        </div>

        <div>
          <div className="card">
            <h3>My pay slips</h3>
            {slips && slips.length > 0 ? (
              <div className="tablewrap">
                <table className="tbl">
                  <thead><tr><th>Period</th><th className="num">Gross</th><th className="num">Net</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {slips.map((s) => (
                      <tr key={s.id}>
                        <td>{monthName(s.period)}</td>
                        <td className="num">{fmtMoney(s.grossPay)}</td>
                        <td className="num"><b>{fmtMoney(s.netPay)}</b></td>
                        <td><Badge value={s.status} /></td>
                        <td><a className="btn ghost sm" target="_blank" rel="noreferrer" href={`/api/payroll/payslips/${s.id}/pdf`}>PDF ↓</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">No pay slips yet.</p>}
          </div>

          <div className="card">
            <h3>My assets</h3>
            {assets && assets.length > 0 ? assets.map((a) => (
              <div className="listitem" key={a.id}><span>{a.name} · {a.assetCode}</span><b><Badge value={a.status} /></b></div>
            )) : <p className="muted">Nothing assigned to you.</p>}
          </div>

          {b && (
            <div className="card">
              <h3>Leave balances</h3>
              <div className="listitem"><span>Annual available</span><b>{b.annualAvailable} of {b.annualEntitlement}</b></div>
              <div className="listitem"><span>Sick leave</span><b>{b.sickAvailable} of 120</b></div>
              <div className="listitem"><span>Unpaid</span><b>{b.unpaidAvailable} of 10</b></div>
              <div className="note">Leave year {b.leaveYear}</div>
            </div>
          )}

          <div className="card">
            <h3>Compliance note</h3>
            <p className="muted" style={{ margin: 0 }}>
              Pay slips are kept for 5 years. For questions about GOSI or your salary, contact
              HR (ahlam@alnoor.sa). Salary is transferred through the Wage Protection System.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

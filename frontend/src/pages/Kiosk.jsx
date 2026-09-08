import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api';

/**
 * Public clock in/out screen — what runs on a physical kiosk device
 * (tablet/PC at the office door). No login needed: employee code + PIN.
 */
export default function Kiosk() {
  const [employees, setEmployees] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [pin, setPin] = useState('');
  const [result, setResult] = useState(null); // {kind:'ok'|'err', msg, record}
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  const timer = useRef();

  useEffect(() => {
    timer.current = setInterval(() => setNow(new Date()), 1000);
    api('GET', '/api/attendance/kiosk-employees').then((d) => setEmployees(d.employees)).catch(() => {});
    return () => clearInterval(timer.current);
  }, []);

  const clockedIn = useMemo(() => !!(result?.record && result.record.clockIn && !result.record.clockOut), [result]);

  const press = (d) => {
    if (d === '⌫') return setPin((p) => p.slice(0, -1));
    if (pin.length < 4) setPin((p) => p + d);
  };

  const doClock = async (action) => {
    if (!employee || pin.length !== 4) {
      setResult({ kind: 'err', msg: 'Choose the employee and enter their 4-digit PIN.' });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await api('POST', '/api/attendance/clock', {
        action, employeeCode: employee.employeeCode, pin, source: 'kiosk',
      });
      setResult({ kind: 'ok', msg: r.message, record: r.record });
      setPin('');
    } catch (err) {
      setResult({ kind: 'err', msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  const ryadhTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(now);
  const ryadhDate = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(now);

  return (
    <div className="kiosk-wrap">
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 800, letterSpacing: '.12em', color: '#99f6e4', fontSize: 13 }}>JAWAZ' HRMS · TIME ATTENDANCE</div>
        <div className="kiosk-clock">{ryadhTime}</div>
        <div style={{ opacity: 0.85 }}>{ryadhDate} · Riyadh (GMT+3)</div>
      </div>

      <div className="kiosk-card">
        {result && (
          <div className={result.kind === 'ok' ? 'form-ok' : 'form-error'} style={{ fontSize: 14 }}>
            {result.msg}
            {result.record && (
              <div className="note" style={{ marginTop: 6 }}>
                {clockedIn ? `Clocked in at ${new Date(result.record.clockIn).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} — remember to clock OUT when you leave.` : 'Have a good day!'}
              </div>
            )}
          </div>
        )}

        {!employee ? (
          <>
            <h2 style={{ textAlign: 'center' }}>Who is clocking in?</h2>
            <div className="empgrid">
              {employees.map((e) => (
                <button key={e.employeeCode} onClick={() => { setEmployee(e); setPin(''); setResult(null); }}>
                  <b>{e.fullNameEn}</b>
                  <div style={{ color: '#64748b' }}>{e.employeeCode}</div>
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>{e.department}</div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0 }}>{employee.fullNameEn}</h2>
              <button className="btn ghost sm" onClick={() => { setEmployee(null); setPin(''); setResult(null); }}>← Change</button>
            </div>
            <div style={{ color: '#64748b', margin: '4px 0 8px' }}>{employee.employeeCode} · {employee.department}</div>
            <div style={{ textAlign: 'center', fontSize: 30, letterSpacing: 14, fontFamily: 'monospace', padding: 8, background: '#f1f5f9', borderRadius: 10 }}>
              {pin.padEnd(4, '·')}
            </div>
            <div className="pinpad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
                k === '' ? <span key={i} /> : <button key={i} onClick={() => press(k)}>{k}</button>
              )}
            </div>
            <div className="flex" style={{ marginTop: 14 }}>
              <button className="btn lg grow" style={{ background: '#0f766e' }} disabled={busy} onClick={() => doClock('in')}>Clock IN</button>
              <button className="btn lg grow" style={{ background: '#334155' }} disabled={busy} onClick={() => doClock('out')}>Clock OUT</button>
            </div>
            <div className="note" style={{ textAlign: 'center', marginTop: 8 }}>
              Employees can set/reset their PIN from their profile page.
            </div>
          </>
        )}
      </div>
      <div style={{ marginTop: 18, fontSize: 13 }}>
        <Link to={getToken() ? '/' : '/login'} style={{ color: '#99f6e4' }}>
          ← Back to {getToken() ? 'the HRMS app' : 'HRMS login'}
        </Link>
      </div>
    </div>
  );
}

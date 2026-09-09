import { useCallback, useEffect, useState } from 'react';
import { api, currentMonth, download } from '../api';
import { useAuth } from '../context/AuthContext';
import { Loader, fmtMoney, fmtDate } from '../components/ui';

export default function Reports() {
  const { user } = useAuth();
  const isHR = ['hr', 'admin'].includes(user.role);
  const isManager = user.role === 'manager';
  const [month, setMonth] = useState(currentMonth());
  const [att, setAtt] = useState(null);
  const [payrollRows, setPayrollRows] = useState(null);
  const [eosb, setEosb] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    setErr('');
    api('GET', `/api/reports/attendance-summary?month=${month}`)
      .then((d) => setAtt(d.attendance))
      .catch((e) => setErr(e.message));
    if (isHR || isManager) {
      api('GET', `/api/reports/payroll?period=${month}`)
        .then((d) => setPayrollRows(d.payroll))
        .catch(() => {});
    }
    if (isHR) {
      api('GET', '/api/reports/eosb')
        .then((d) => setEosb(d.eosb))
        .catch(() => {});
    }
  }, [month, isHR, isManager]);

  useEffect(load, [load]);

  const csv = (what) => {
    const map = {
      att: [`/api/reports/attendance-summary?month=${month}&format=csv`, `attendance-summary-${month}.csv`],
      payroll: [`/api/reports/payroll?period=${month}&format=csv`, `payroll-${month}.csv`],
      leave: [`/api/reports/leave?month=${month}&format=csv`, `leave-${month}.csv`],
      loans: ['/api/reports/loans?format=csv', 'loan-register.csv'],
      eosb: ['/api/reports/eosb?format=csv', 'eosb-estimates.csv'],
    };
    const [url, name] = map[what];
    download(url, name).catch((e) => alert(e.message));
  };

  if (!att && !err) return <Loader />;
  if (err && !att) return <Loader error={err} onRetry={load} />;

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>Reports</h1>
          <p>Attendance, payroll and compliance reports — exportable as CSV for Excel/accounting.</p>
        </div>
        <input className="input" type="month" value={month} max={currentMonth()} onChange={(e) => setMonth(e.target.value)} style={{ maxWidth: 170 }} />
      </div>

      {err && <div className="error-box">{err}</div>}

      <div className="card tight">
        <div className="flex spread">
          <h3 style={{ margin: 0 }}>Attendance summary · {month}</h3>
          <button className="btn ghost sm" onClick={() => csv('att')}>⬇ CSV</button>
        </div>
        <div className="tablewrap" style={{ marginTop: 10 }}>
          <table className="tbl">
            <thead><tr><th>Employee</th><th>Department</th><th className="num">Present</th><th className="num">Expected</th><th className="num">Absent</th><th className="num">Hours</th><th className="num">Overtime</th></tr></thead>
            <tbody>
              {att.map((r) => (
                <tr key={r.employeeCode}>
                  <td><b>{r.employee}</b> <small className="muted">{r.employeeCode}</small></td>
                  <td>{r.department}</td>
                  <td className="num">{r.presentDays}</td><td className="num">{r.expectedWorkdays}</td>
                  <td className="num">{r.absentDays > 0 ? <span style={{ color: 'var(--red)' }}>{r.absentDays}</span> : 0}</td>
                  <td className="num">{r.hours.toFixed(0)}</td>
                  <td className="num">{r.overtimeHours > 0 ? r.overtimeHours.toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(isHR || isManager) && payrollRows && (
        <div className="card">
          <div className="flex spread">
            <h3 style={{ margin: 0 }}>Payroll register · {month}</h3>
            <button className="btn ghost sm" onClick={() => csv('payroll')}>⬇ CSV</button>
          </div>
          <div className="tablewrap" style={{ marginTop: 10 }}>
            <table className="tbl">
              <thead><tr><th>Employee</th><th>Type</th><th className="num">Gross</th><th className="num">GOSI emp</th><th className="num">Loan</th><th className="num">Net</th><th className="num">Employer cost</th></tr></thead>
              <tbody>
                {payrollRows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.employeeCode} · {r.employee}</td>
                    <td>{r.payType} · {r.nationality}</td>
                    <td className="num">{fmtMoney(r.gross)}</td><td className="num">{fmtMoney(r.gosiEmployee)}</td>
                    <td className="num">{r.loan ? fmtMoney(r.loan) : '—'}</td><td className="num"><b>{fmtMoney(r.net)}</b></td>
                    <td className="num">{fmtMoney(r.employerCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex spread">
          <h3 style={{ margin: 0 }}>Leave register · {month}</h3>
          <button className="btn ghost sm" onClick={() => csv('leave')}>⬇ CSV</button>
        </div>
        <p className="muted" style={{ marginTop: 4 }}>See the Leave page for approvals. This report covers leave overlapping {month}.</p>
      </div>

      {(isHR || isManager) && (
        <div className="card">
          <div className="flex spread">
            <h3 style={{ margin: 0 }}>Loan register</h3>
            <button className="btn ghost sm" onClick={() => csv('loans')}>⬇ CSV</button>
          </div>
          <p className="muted" style={{ marginTop: 4 }}>See the Loans page for applications and decisions.</p>
        </div>
      )}

      {isHR && eosb && (
        <div className="card">
          <div className="flex spread">
            <h3 style={{ margin: 0 }}>End-of-service benefit estimates (Art. 84-85)</h3>
            <button className="btn ghost sm" onClick={() => csv('eosb')}>⬇ CSV</button>
          </div>
          <p className="note">½ month wage per year for the first 5 years, 1 month per year after — pro-rated, based on the latest wage. Confirm the reason for exit and contract terms before payment.</p>
          <div className="tablewrap" style={{ marginTop: 8 }}>
            <table className="tbl">
              <thead><tr><th>Employee</th><th>Hire date</th><th className="num">Service</th><th className="num">Monthly wage</th><th className="num">Estimate</th></tr></thead>
              <tbody>
                {eosb.map((r) => (
                  <tr key={r.employeeCode}>
                    <td>{r.employeeCode} · {r.employee}</td>
                    <td>{fmtDate(r.hireDate)}</td>
                    <td className="num">{r.serviceYears} y</td>
                    <td className="num">{fmtMoney(r.monthlyWage)}</td>
                    <td className="num"><b>{fmtMoney(r.estimatedEOSB)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isHR && !isManager && (
        <div className="card">
          <p className="muted">Managers see their team's attendance and payroll registers here; HR sees the full company.</p>
        </div>
      )}
    </div>
  );
}

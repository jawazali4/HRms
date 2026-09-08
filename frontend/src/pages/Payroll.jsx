import { useCallback, useEffect, useState } from 'react';
import { api, currentMonth } from '../api';
import { Badge, Modal, Loader, fmtMoney, monthName, fmtClock } from '../components/ui';

export default function Payroll() {
  const [period, setPeriod] = useState(currentMonth());
  const [slips, setSlips] = useState(null);
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState(null);
  const [detail, setDetail] = useState(null);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    setErr('');
    Promise.all([
      api('GET', `/api/payroll/payslips?period=${period}&limit=1000`),
      api('GET', `/api/payroll/summary?period=${period}`),
      api('GET', `/api/payroll/status?period=${period}`),
    ])
      .then(([s, sum, st]) => {
        setSlips(s.payslips);
        setSummary(sum);
        setStatus(st.rows);
      })
      .catch((e) => setErr(e.message));
  }, [period]);

  useEffect(load, [load]);

  const run = async () => {
    if (!window.confirm(`Generate draft pay slips for ${monthName(period)}?\n\nExisting draft slips will be recalculated; paid slips are locked.`)) return;
    setBusy('run');
    setMsg(null);
    setErr('');
    try {
      const r = await api('POST', '/api/payroll/run', { period });
      setMsg(r.message);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const finalize = async () => {
    if (!window.confirm(`Approve & finalize ${monthName(period)} payroll?\n\nPay slips become final (locked) and are emailed to employees.`)) return;
    setBusy('finalize');
    setMsg(null);
    try {
      const r = await api('POST', '/api/payroll/finalize', { period });
      setMsg(`${r.message} ${r.result.emailDisabled ? '(Email is not configured — see SMTP settings in DEPLOYMENT.md.)' : ''}`);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const resetPeriod = async () => {
    if (!window.confirm(`Unlock ${monthName(period)}? All pay slips for this period will be deleted so you can re-run payroll (loan repayments are restored).`)) return;
    setBusy('reset');
    try {
      const r = await api('POST', '/api/payroll/reset', { period });
      setMsg(r.message);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const emailOne = async (slip) => {
    try {
      const r = await api('POST', `/api/payroll/payslips/${slip.id}/email`);
      alert(r.message);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  if (!slips) return <Loader />;

  const locked = slips.some((s) => s.status === 'paid');
  const notRun = status ? status.filter((r) => r.status === 'not_run') : [];

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>Payroll — {monthName(period)}</h1>
          <p>
            GOSI contributions (Saudi System A/B, SANED, occupational hazards), Saudi Labour Law
            leave pay, overtime at 150% (200% on rest days), loan deductions. Salaries must be
            paid by the 10th of the next month (Wage Protection System).
          </p>
        </div>
        <div className="row">
          <input className="input" type="month" value={period} min="2026-06" max={currentMonth()} onChange={(e) => setPeriod(e.target.value)} style={{ maxWidth: 180 }} />
        </div>
      </div>

      {err && <div className="error-box">{err}</div>}
      {msg && <div className="form-ok">{msg}</div>}

      <div className="card tight">
        <div className="flex" style={{ justifyContent: 'space-between' }}>
          <div className="flex">
            <button className="btn" disabled={busy === 'run'} onClick={run}>{busy === 'run' ? 'Calculating…' : '1 · Run payroll'}</button>
            <button className="btn" style={{ background: '#15803d' }} disabled={busy === 'finalize' || !slips.some((s) => s.status === 'draft')} onClick={finalize}>
              {busy === 'finalize' ? 'Finalizing…' : '2 · Finalize & email slips'}
            </button>
            <button className="btn ghost sm" disabled={busy === 'reset'} onClick={resetPeriod} title="Unlock period to re-run">Reset period</button>
          </div>
          {locked && <small className="muted">⚠ some slips are finalized/paid — Run payroll skips paid slips (use Reset to unlock).</small>}
          {notRun.length > 0 && <small className="muted">{notRun.length} employee(s) without a slip yet</small>}
        </div>
      </div>

      {summary && (
        <div className="statgrid">
          <div className="stat"><div className="k">Pay slips</div><div className="v">{summary.totals.count}</div></div>
          <div className="stat"><div className="k">Gross payroll</div><div className="v">{fmtMoney(summary.totals.gross)}</div></div>
          <div className="stat"><div className="k">Net salaries</div><div className="v">{fmtMoney(summary.totals.net)}</div></div>
          <div className="stat"><div className="k">GOSI employee</div><div className="v">{fmtMoney(summary.totals.gosiEmployee)}</div></div>
          <div className="stat"><div className="k">GOSI employer</div><div className="v">{fmtMoney(summary.totals.gosiEmployer)}</div></div>
          <div className="stat"><div className="k">Employer total cost</div><div className="v">{fmtMoney(summary.totals.employerCost)}</div></div>
        </div>
      )}

      <div className="grid2">
        {summary && (
          <div className="card">
            <h3>By pay type</h3>
            {Object.entries(summary.byPayType).map(([k, v]) => (
              <div className="listitem" key={k}><span>{k} ({v.count})</span><b>{fmtMoney(v.gross)} gross · {fmtMoney(v.net)} net</b></div>
            ))}
            {Object.keys(summary.byPayType).length === 0 && <p className="muted">No slips yet.</p>}
          </div>
        )}
        {summary && (
          <div className="card">
            <h3>By department</h3>
            {Object.entries(summary.byDepartment).map(([k, v]) => (
              <div className="listitem" key={k}><span>{k} ({v.count})</span><b>{fmtMoney(v.net)}</b></div>
            ))}
            {Object.keys(summary.byDepartment).length === 0 && <p className="muted">No slips yet.</p>}
          </div>
        )}
      </div>

      <h3 style={{ margin: '6px 0 10px' }}>Pay slips</h3>
      <div className="tablewrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Employee</th><th className="num">Gross</th><th className="num">GOSI (emp)</th>
              <th className="num">Loan</th><th className="num">Net</th><th className="num">Employer cost</th><th>Status</th><th>Email</th><th></th>
            </tr>
          </thead>
          <tbody>
            {slips.map((s) => (
              <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(s)}>
                <td>{s.employee ? `${s.employee.employeeCode} · ${s.employee.fullNameEn}` : s.employeeId}</td>
                <td className="num">{fmtMoney(s.grossPay)}</td>
                <td className="num">{fmtMoney(s.gosiEmployee)}</td>
                <td className="num">{s.loanRepayment ? fmtMoney(s.loanRepayment) : '—'}</td>
                <td className="num"><b>{fmtMoney(s.netPay)}</b></td>
                <td className="num">{fmtMoney(s.employerTotalCost)}</td>
                <td><Badge value={s.status} /></td>
                <td>
                  {s.emailStatus === 'sent' ? <Badge value="sent" />
                    : s.emailStatus === 'disabled' ? <small className="muted">—</small>
                    : <small className="muted">{s.emailStatus || '—'}</small>}
                </td>
                <td>
                  <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); setDetail(s); }}>View</button>
                </td>
              </tr>
            ))}
            {slips.length === 0 && <tr><td colSpan="9"><div className="empty">Run payroll to generate slips for this month.</div></td></tr>}
          </tbody>
        </table>
      </div>

      {detail && (
        <PayslipModal slip={detail} onClose={() => setDetail(null)} onEmail={emailOne} />
      )}
    </div>
  );
}

export function PayslipModal({ slip, onClose, onEmail }) {
  const j = slip.json || {};
  const rows = (arr) =>
    arr.map(([l, v, b]) => (
      <div className="listitem" key={l}><span>{l}</span><b style={b ? { color: 'var(--red)' } : undefined}>{fmtMoney(v)}</b></div>
    ));
  return (
    <Modal title={`Pay slip — ${slip.employee ? slip.employee.fullNameEn : ''} (${monthName(slip.period)})`} onClose={onClose} wide>
      <div className="grid2">
        <div>
          <h3>Earnings</h3>
          {rows([
            ['Basic salary', slip.baseSalary], ['Housing allowance', slip.housingAllowance],
            ['Transport allowance', slip.transportAllowance], ['Other allowances', slip.otherAllowances],
            ['Overtime', slip.overtimePay], ['Commission', slip.commissionPay],
            ['Gross pay', slip.grossPay, false],
          ])}
          {j.attendance && (
            <div className="note" style={{ marginTop: 6 }}>
              {j.attendance.presentDays} of {j.attendance.expectedWorkdays} workdays present · {j.attendance.hoursWorked} h worked
              {j.attendance.stdOvertimeHrs > 0 && ` · ${j.attendance.stdOvertimeHrs} h overtime`}
              {j.attendance.restDayHrs > 0 && ` · ${j.attendance.restDayHrs} h on rest days`}
              {j.attendance.absentDays > 0 && ` · ${j.attendance.absentDays} absent`}
            </div>
          )}
        </div>
        <div>
          <h3>Deductions & employer cost</h3>
          {rows([
            ['GOSI — employee share', slip.gosiEmployee, true],
            ['Loan repayment', slip.loanRepayment, true],
            ['Other deductions', slip.otherDeductions, true],
            ['Total deductions', slip.totalDeductions, true],
            ['Net pay', slip.netPay, false],
          ])}
          <div className="listitem"><span>GOSI — employer</span><b>{fmtMoney(slip.gosiEmployer)}</b></div>
          <div className="listitem"><span>Employer total cost</span><b>{fmtMoney(slip.employerTotalCost)}</b></div>
          {j.gosi && <div className="note">GOSI contributory wage: {fmtMoney(j.gosi.contributoryWage)} · {slip.employee ? '' : ''}{j.compliance?.note}</div>}
        </div>
      </div>
      {j.notes && j.notes.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#475569', fontSize: 12.5 }}>
          {j.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
      <div className="flex" style={{ marginTop: 14 }}>
        <a className="btn" target="_blank" rel="noreferrer" href={`/api/payroll/payslips/${slip.id}/pdf`}>Download PDF ↓</a>
        <button className="btn ghost" onClick={() => onEmail && onEmail(slip)}>Email this pay slip</button>
        <span className="spacer" style={{ flex: 1 }} />
        <Badge value={slip.status} />
      </div>
      <div className="modal-foot"><button className="btn ghost" onClick={onClose}>Close</button></div>
    </Modal>
  );
}

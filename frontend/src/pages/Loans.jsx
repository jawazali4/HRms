import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Modal, Badge, Loader, fmtDate, fmtMoney } from '../components/ui';

export default function Loans() {
  const { user } = useAuth();
  const role = user.role;
  const isHR = ['hr', 'admin'].includes(role);
  const [loans, setLoans] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: '', amount: '', months: 12, reason: '', interestRate: 0 });
  const [allEmp, setAllEmp] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('GET', '/api/loans?limit=300').then((d) => setLoans(d.loans)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const openForm = async () => {
    setError('');
    setForm({ employeeId: '', amount: '', months: 12, reason: '', interestRate: 0 });
    if (isHR && !allEmp.length) {
      try { setAllEmp((await api('GET', '/api/employees')).employees); } catch { /* */ }
    }
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        amount: Number(form.amount),
        months: Number(form.months),
        reason: form.reason,
        interestRate: Number(form.interestRate || 0),
      };
      if (isHR && form.employeeId) payload.employeeId = Number(form.employeeId);
      const r = await api('POST', '/api/loans/requests', payload);
      setOpen(false);
      alert(r.message);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (loan, decision) => {
    if (!window.confirm(`${decision === 'approved' ? 'Approve' : 'Reject'} a ${fmtMoney(loan.amount)} loan for ${loan.employee?.fullNameEn}?`)) return;
    try {
      const r = await api('POST', `/api/loans/${loan.id}/decision`, { decision, note: decision === 'approved' ? 'Approved' : 'Rejected' });
      alert(r.message || `Loan ${decision}.`);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  if (!loans && !error) return <Loader />;
  if (error && !loans) return <Loader error={error} onRetry={load} />;

  const pendingCount = loans.filter((l) => l.status === 'pending').length;
  const active = loans.filter((l) => ['active', 'approved'].includes(l.status));
  const outstanding = active.reduce((s, l) => s + l.remainingAmount, 0);

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>Employee Loans</h1>
          <p>Interest-free company loans (Islamic-compliant by default). Repayments are deducted from the monthly salary in the payroll run.</p>
        </div>
        <button className="btn" onClick={openForm}>+ Apply for a loan</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="statgrid">
        <div className="stat"><div className="k">Pending applications</div><div className="v">{pendingCount}</div></div>
        <div className="stat"><div className="k">Active loans</div><div className="v">{active.length}</div></div>
        <div className="stat"><div className="k">Outstanding total</div><div className="v">{fmtMoney(outstanding)}</div></div>
      </div>

      <div className="tablewrap">
        <table className="tbl">
          <thead>
            <tr>
              {(isHR || role === 'manager') && <th>Employee</th>}
              <th className="num">Amount</th><th className="num">Monthly</th><th className="num">Months</th>
              <th className="num">Remaining</th><th>Status</th><th>Reason</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l) => (
              <tr key={l.id}>
                {(isHR || role === 'manager') && <td>{l.employee ? `${l.employee.employeeCode} · ${l.employee.fullNameEn}` : l.employeeId}</td>}
                <td className="num">{fmtMoney(l.amount)}</td>
                <td className="num">{fmtMoney(l.monthlyInstallment)}</td>
                <td className="num">{l.months}</td>
                <td className="num">{fmtMoney(l.remainingAmount)}</td>
                <td><Badge value={l.status} /></td>
                <td style={{ maxWidth: 220 }}>{l.reason}</td>
                <td>
                  {l.status === 'pending' && (isHR || role === 'manager') ? (
                    <div className="flex" style={{ gap: 5, justifyContent: 'flex-end' }}>
                      <button className="btn sm" onClick={() => decide(l, 'approved')}>Approve</button>
                      <button className="btn sm danger" onClick={() => decide(l, 'rejected')}>Reject</button>
                    </div>
                  ) : <small className="muted">{l.status === 'approved' ? `repayments from ${l.startMonth || '—'}` : l.status === 'pending' ? 'waiting for approval' : ''}</small>}
                </td>
              </tr>
            ))}
            {loans.length === 0 && <tr><td colSpan="8"><div className="empty">No loans found.</div></td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="Loan application" onClose={() => setOpen(false)}>
          <form onSubmit={submit}>
            {error && <div className="form-error">{error}</div>}
            <div className="formgrid">
              {isHR && (
                <label className="f"><span>For employee</span>
                  <select className="select" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                    <option value="">Myself</option>
                    {allEmp.map((em) => <option key={em.id} value={em.id}>{em.employeeCode} · {em.fullNameEn}</option>)}
                  </select>
                </label>
              )}
              <label className="f"><span>Amount (SAR)</span><input className="input" type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label>
              <label className="f"><span>Repayment months</span>
                <select className="select" value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })}>
                  {[3, 6, 9, 12, 18, 24, 36, 48].map((m) => <option key={m} value={m}>{m} months</option>)}
                </select>
              </label>
              <label className="f"><span>Reason</span><input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required placeholder="What is the loan for?" /></label>
            </div>
            <div className="field-hint">Monthly installment = amount ÷ months (interest 0%). Installments must stay within 33% of the monthly wage and 50% of gross pay protection.</div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn" disabled={busy}>{busy ? 'Submitting…' : 'Submit application'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Modal, Badge, Loader, fmtDate } from '../components/ui';

const LEAVE_TYPES = [
  { v: 'annual', l: 'Annual leave (paid — statutory)' },
  { v: 'sick', l: 'Sick leave (statutory — doctor certificate needed)' },
  { v: 'unpaid', l: 'Unpaid leave (max 10 days/year)' },
  { v: 'maternity', l: 'Maternity (company policy 10 weeks)' },
  { v: 'hajj', l: 'Hajj' },
];

export default function Leave() {
  const { user } = useAuth();
  const role = user.role;
  const isHR = ['hr', 'admin'].includes(role);
  const [requests, setRequests] = useState(null);
  const [balances, setBalances] = useState(null);
  const [tab, setTab] = useState(isHR || role === 'manager' ? 'requests' : 'mine');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: 'annual', startDate: '', endDate: '', reason: '', employeeId: '' });
  const [allEmp, setAllEmp] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('GET', '/api/leave/requests?limit=300')
      .then((d) => setRequests(d.requests))
      .catch((e) => setError(e.message));
    api('GET', '/api/leave/balances')
      .then((d) => setBalances(d.balances))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  const openForm = async () => {
    setError('');
    setForm({ type: 'annual', startDate: new Date().toISOString().slice(0, 10), endDate: '', reason: '', employeeId: '' });
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
      const payload = { ...form };
      if (isHR && payload.employeeId) payload.employeeId = Number(payload.employeeId);
      else delete payload.employeeId;
      const r = await api('POST', '/api/leave/requests', payload);
      setOpen(false);
      alert(r.message);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (r, decision) => {
    if (!window.confirm(`${decision === 'approved' ? 'Approve' : 'Reject'} ${r.days} day(s) of ${r.type} leave for ${r.employee?.fullNameEn}?`)) return;
    try {
      const note = decision === 'rejected' ? window.prompt('Reason (optional):', '') || 'Rejected' : 'Approved';
      await api('POST', `/api/leave/requests/${r.id}/decision`, { decision, note });
      alert(`Request ${decision}.`);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const cancel = async (r) => {
    if (!window.confirm('Cancel this request?')) return;
    try {
      await api('DELETE', `/api/leave/requests/${r.id}`);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const daysBetween = (a, b) => {
    if (!a || !b) return 0;
    return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
  };

  if (!requests && !error) return <Loader />;
  if (error && !requests) return <Loader error={error} onRetry={load} />;

  const canDecide = (r) => isHR || (role === 'manager');

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>Leave Management</h1>
          <p>
            Saudi Labour Law: 21 paid days/year (30 after 5 years of service), sick leave up to
            120 days (30 full pay → 60 at 75% → 30 unpaid), and maternity per company policy.
          </p>
        </div>
        <button className="btn" onClick={openForm}>+ Request leave</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="tabs">
        <button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>
          {isHR || role === 'manager' ? 'All requests / approvals' : 'My requests'}
        </button>
        <button className={tab === 'balance' ? 'active' : ''} onClick={() => setTab('balance')}>My balance</button>
        {isHR && <button className={tab === 'hrteam' ? 'active' : ''} onClick={() => setTab('hrteam')}>Team balances</button>}
      </div>

      {tab === 'requests' && (
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                {(isHR || role === 'manager') && <th>Employee</th>}
                <th>Type</th><th>From</th><th>To</th><th className="num">Days</th><th>Status</th><th>Reason</th><th></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  {(isHR || role === 'manager') && <td>{r.employee ? `${r.employee.employeeCode} · ${r.employee.fullNameEn}` : r.employeeId}</td>}
                  <td><Badge value={r.type} /></td>
                  <td>{fmtDate(r.startDate)}</td><td>{fmtDate(r.endDate)}</td>
                  <td className="num">{r.days}</td>
                  <td><Badge value={r.status} /></td>
                  <td style={{ maxWidth: 220 }}><span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.reason}</span></td>
                  <td>
                    {r.status === 'pending' && canDecide(r) ? (
                      <div className="flex" style={{ gap: 5, justifyContent: 'flex-end' }}>
                        <button className="btn sm" onClick={() => decide(r, 'approved')}>Approve</button>
                        <button className="btn sm danger" onClick={() => decide(r, 'rejected')}>Reject</button>
                      </div>
                    ) : r.status === 'pending' ? (
                      <button className="btn ghost sm" onClick={() => cancel(r)}>Cancel</button>
                    ) : <small className="muted">{r.reviewedNote || ''}</small>}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && <tr><td colSpan="8"><div className="empty">No leave requests found.</div></td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'balance' && balances && (
        <div className="card" style={{ maxWidth: 560 }}>
          <h3>My leave balance <small>({balances.leaveYear})</small></h3>
          <div className="listitem"><span>Annual leave entitlement</span><b>{balances.annualEntitlement} days</b></div>
          <div className="listitem"><span>Annual — accrued so far</span><b>{balances.annualAccrued} days</b></div>
          <div className="listitem"><span>Annual — approved this year</span><b>{balances.annualUsed} days</b></div>
          <div className="listitem"><span>Annual — available now</span><b style={{ color: 'var(--teal)' }}>{balances.annualAvailable} days</b></div>
          <div className="listitem"><span>Sick leave remaining (statutory 120)</span><b>{balances.sickAvailable} days</b></div>
          <div className="listitem"><span>Unpaid leave remaining (max 10)</span><b>{balances.unpaidAvailable} days</b></div>
          <div className="note">Annual leave accrues day by day over your leave year. Unused paid leave may carry over with manager approval.</div>
        </div>
      )}

      {tab === 'hrteam' && (
        <p className="muted">Open an employee's record in <b>Employees</b> → View to see their balances.</p>
      )}

      {open && (
        <Modal title="Request leave" onClose={() => setOpen(false)}>
          <form onSubmit={submit}>
            {error && <div className="form-error">{error}</div>}
            <div className="formgrid">
              {isHR && (
                <label className="f"><span>For employee (HR on behalf)</span>
                  <select className="select" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                    <option value="">Myself</option>
                    {allEmp.map((em) => <option key={em.id} value={em.id}>{em.employeeCode} · {em.fullNameEn}</option>)}
                  </select>
                </label>
              )}
              <label className="f"><span>Leave type</span>
                <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {LEAVE_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                </select>
              </label>
              <label className="f"><span>Start date</span><input className="input" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></label>
              <label className="f"><span>End date</span><input className="input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required /></label>
              <label className="f" style={{ gridColumn: '1 / -1' }}><span>Reason</span><textarea className="input" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required placeholder="Short explanation…" /></label>
            </div>
            <div className="field-hint">
              {form.startDate && form.endDate && form.endDate >= form.startDate ? `${daysBetween(form.startDate, form.endDate)} calendar day(s). ` : ''}
              Balances are validated on submission (annual, sick and unpaid).
            </div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn" disabled={busy}>{busy ? 'Submitting…' : isHR ? 'Submit (HR approval)' : 'Submit for approval'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

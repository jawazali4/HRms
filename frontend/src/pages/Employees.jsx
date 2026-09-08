import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Modal, Badge, Loader, fmtMoney, fmtDate } from '../components/ui';

const EMPTY = {
  fullNameAr: '', fullNameEn: '', email: '', phone: '', nationalId: '', nationality: 'saudi',
  gosiScheme: 'systemB', hireDate: '', role: 'employee', department: '', jobTitle: '',
  managerId: '', payType: 'salaried', basicSalary: '', housingAllowance: '', transportAllowance: '',
  otherAllowances: '', hourlyRate: '', commissionRate: '', contractType: 'full_time', iban: '',
};

export default function Employees() {
  const { user } = useAuth();
  const isHR = ['hr', 'admin'].includes(user.role);
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState({ department: '', status: '', payType: '', search: '' });
  const [view, setView] = useState(null); // {employee, balances}
  const [editing, setEditing] = useState(null); // employee row or 'new'
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError('');
    const params = new URLSearchParams();
    if (isHR) {
      if (q.department) params.set('department', q.department);
      if (q.status) params.set('status', q.status);
      if (q.payType) params.set('payType', q.payType);
      if (q.search) params.set('search', q.search);
      if (q.finance) params.set('finance', '1');
    }
    api('GET', `/api/employees?${params.toString()}`)
      .then((d) => setList(d.employees))
      .catch((e) => setError(e.message));
  }, [isHR, q]);

  useEffect(load, [load]);

  const openView = async (emp) => {
    try {
      const d = await api('GET', `/api/employees/${emp.id}`);
      setView(d);
    } catch (e) {
      setError(e.message);
    }
  };

  const openEdit = (emp) => {
    if (emp) {
      setForm({
        ...EMPTY,
        fullNameAr: emp.fullNameAr || '', fullNameEn: emp.fullNameEn || '', email: emp.email,
        phone: emp.phone || '', nationalId: emp.nationalId || '', nationality: emp.nationality || 'saudi',
        gosiScheme: emp.gosiScheme || 'systemB', hireDate: emp.hireDate, role: emp.role || 'employee',
        department: emp.department || '', jobTitle: emp.jobTitle || '', managerId: emp.managerId || '',
        payType: emp.payType || 'salaried',
        basicSalary: emp.basicSalary ?? '', housingAllowance: emp.housingAllowance ?? '',
        transportAllowance: emp.transportAllowance ?? '', otherAllowances: emp.otherAllowances ?? '',
        hourlyRate: emp.hourlyRate ?? '', commissionRate: emp.commissionRate ?? '',
        contractType: emp.contractType || 'full_time', iban: emp.iban || '',
      });
    } else setForm(EMPTY);
    setEditing(emp || 'new');
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form };
      for (const k of ['managerId', 'basicSalary', 'housingAllowance', 'transportAllowance', 'otherAllowances', 'hourlyRate', 'commissionRate']) {
        payload[k] = payload[k] === '' ? null : Number(payload[k]);
      }
      if (editing === 'new') {
        const r = await api('POST', '/api/employees', payload);
        alert(r.credentials?.password ? `Account created for ${r.credentials.email}.\nTemporary password: ${r.credentials.password}\n\nShare it with the employee — they should change it after first login.` : 'Employee created.');
      } else {
        await api('PUT', `/api/employees/${editing.id}`, payload);
        alert('Employee updated.');
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetPin = async (emp) => {
    const pin = window.prompt(`New kiosk PIN (4 digits) for ${emp.fullNameEn}:`, '1234');
    if (!pin) return;
    try {
      await api('PUT', `/api/employees/${emp.id}/pin`, { pin: Number(pin) });
      alert(`Kiosk PIN updated for ${emp.employeeCode}.`);
    } catch (err) {
      alert(err.message);
    }
  };

  if (!list) return <Loader />;

  const managers = list.filter((e) => e.role === 'manager' || e.role === 'hr');

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>Employees</h1>
          <p>
            {isHR && 'Full directory with salaries and GOSI settings. Employees and managers only see what their role allows.'}
            {user.role === 'manager' && 'Your team (plus yourself). Click a person to see their profile and leave balance.'}
            {user.role === 'employee' && 'Your own employee record.'}
          </p>
        </div>
        {isHR && <button className="btn" onClick={() => openEdit(null)}>+ Add employee</button>}
      </div>

      {error && <div className="error-box">{error}</div>}
      {!isHR && user.role === 'employee' && list.length === 1 && (
        <div className="card" style={{ textAlign: 'center' }}>
          <h2>{list[0].fullNameEn} · {list[0].employeeCode}</h2>
          <p className="muted">{list[0].jobTitle} — {list[0].department}</p>
          <button className="btn" onClick={() => openView(list[0])}>View my record & leave balance</button>
        </div>
      )}

      {isHR && (
        <div className="card tight">
          <div className="flex">
            <input className="input" style={{ maxWidth: 220 }} placeholder="Search name, code, email…" value={q.search} onChange={(e) => setQ({ ...q, search: e.target.value })} />
            <select className="select" style={{ maxWidth: 160 }} value={q.department} onChange={(e) => setQ({ ...q, department: e.target.value })}>
              <option value="">All departments</option>
              {['Human Resources', 'Sales & Operations', 'Warehouse', 'Sales', 'Customer Care', 'Finance', 'IT'].map((d) => <option key={d}>{d}</option>)}
            </select>
            <select className="select" style={{ maxWidth: 150 }} value={q.status} onChange={(e) => setQ({ ...q, status: e.target.value })}>
              <option value="">Any status</option>
              <option value="active">Active</option><option value="on_leave">On leave</option><option value="terminated">Terminated</option>
            </select>
            <select className="select" style={{ maxWidth: 160 }} value={q.payType} onChange={(e) => setQ({ ...q, payType: e.target.value })}>
              <option value="">Any pay type</option>
              <option value="salaried">Salaried</option><option value="hourly">Hourly</option><option value="commission">Commission</option>
            </select>
            <button className="btn ghost sm" onClick={load}>Apply</button>
          </div>
        </div>
      )}

      <div className="tablewrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Code</th><th>Name</th><th>Role</th><th>Department</th><th>Pay type</th>
              {isHR && <th className="num">Monthly wage</th>}
              <th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id}>
                <td><b>{e.employeeCode}</b></td>
                <td>
                  <div style={{ fontWeight: 600 }}>{e.fullNameEn}</div>
                  <small className="muted">{e.fullNameAr} · {e.jobTitle}</small>
                </td>
                <td><Badge value={`role-${e.role}`} /></td>
                <td>{e.department || '—'}</td>
                <td><Badge value={e.payType} /></td>
                {isHR && <td className="num">{e.monthlyGross !== undefined ? fmtMoney(e.monthlyGross) : '—'}</td>}
                <td><Badge value={e.status} /></td>
                <td>
                  <div className="flex" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn ghost sm" onClick={() => openView(e)}>View</button>
                    {isHR && (
                      <>
                        <button className="btn ghost sm" onClick={() => openEdit(e)}>Edit</button>
                        <button className="btn ghost sm" title="Set kiosk PIN" onClick={() => resetPin(e)}>PIN</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan="8"><div className="empty">No employees found.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* View modal */}
      {view && (
        <Modal title={`${view.employee.fullNameEn} · ${view.employee.employeeCode}`} onClose={() => setView(null)} wide>
          <div className="grid2">
            <div>
              <h3>Profile</h3>
              {[
                ['Arabic name', view.employee.fullNameAr], ['Email', view.employee.email], ['Phone', view.employee.phone],
                ['Job title', view.employee.jobTitle], ['Department', view.employee.department],
                ['Hire date', fmtDate(view.employee.hireDate)], ['Status', view.employee.status],
                ['Pay type', view.employee.payType], ['Contract', view.employee.contractType],
                ['Nationality', view.employee.nationality], ['IBAN', view.employee.iban],
              ].map(([k, v]) => (
                <div className="listitem" key={k}><span>{k}</span><b>{v || '—'}</b></div>
              ))}
              {view.employee.managerName && <div className="listitem"><span>Reports to</span><b>{view.employee.managerName}</b></div>}
            </div>
            <div>
              {view.employee.basicSalary !== undefined && (
                <>
                  <h3>Compensation (visible to HR & self)</h3>
                  <div className="listitem"><span>Basic salary</span><b>{fmtMoney(view.employee.basicSalary)}</b></div>
                  <div className="listitem"><span>Housing</span><b>{fmtMoney(view.employee.housingAllowance)}</b></div>
                  <div className="listitem"><span>Transport</span><b>{fmtMoney(view.employee.transportAllowance)}</b></div>
                  {view.employee.payType === 'hourly' && <div className="listitem"><span>Hourly rate</span><b>{fmtMoney(view.employee.hourlyRate)}/h</b></div>}
                  {view.employee.payType === 'commission' && <div className="listitem"><span>Commission</span><b>{view.employee.commissionRate}% of sales</b></div>}
                  <div className="listitem"><span>Monthly gross</span><b>{fmtMoney(view.employee.monthlyGross)}</b></div>
                  <div className="listitem"><span>GOSI scheme</span><b>{view.employee.gosiScheme}</b></div>
                </>
              )}
              {view.balances && (
                <>
                  <h3>Leave balances</h3>
                  <div className="listitem"><span>Annual (accrued)</span><b>{view.balances.annualAccrued} / {view.balances.annualEntitlement}</b></div>
                  <div className="listitem"><span>Annual available</span><b>{view.balances.annualAvailable} d</b></div>
                  <div className="listitem"><span>Sick (statutory)</span><b>{view.balances.sickAvailable} of 120 d</b></div>
                  <div className="listitem"><span>Unpaid</span><b>{view.balances.unpaidAvailable} of 10 d</b></div>
                  <small className="note">Leave year {view.balances.leaveYear}</small>
                </>
              )}
            </div>
          </div>
          <div className="modal-foot"><button className="btn ghost" onClick={() => setView(null)}>Close</button></div>
        </Modal>
      )}

      {/* Create/Edit modal */}
      {editing && (
        <Modal title={editing === 'new' ? 'Add employee' : `Edit ${editing.fullNameEn}`} onClose={() => setEditing(null)} wide>
          {error && <div className="form-error">{error}</div>}
          <form onSubmit={save}>
            <div className="formgrid">
              <label className="f"><span>Full name (Arabic) *</span><input className="input" value={form.fullNameAr} onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })} required /></label>
              <label className="f"><span>Full name (English) *</span><input className="input" value={form.fullNameEn} onChange={(e) => setForm({ ...form, fullNameEn: e.target.value })} required /></label>
              <label className="f"><span>Work email *</span><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
              <label className="f"><span>Phone</span><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
              <label className="f"><span>National ID / Iqama</span><input className="input" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} /></label>
              <label className="f"><span>Nationality (GOSI)</span>
                <select className="select" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })}>
                  <option value="saudi">Saudi</option><option value="gcc">GCC national</option><option value="expat">Expatriate (non-GCC)</option>
                </select>
              </label>
              <label className="f"><span>GOSI scheme</span>
                <select className="select" value={form.gosiScheme} onChange={(e) => setForm({ ...form, gosiScheme: e.target.value })}>
                  <option value="systemB">Saudi — System B (enrolled 3 Jul 2024+)</option>
                  <option value="systemA">Saudi — System A (before 3 Jul 2024)</option>
                  <option value="none">Not enrolled / non-Saudi</option>
                </select>
              </label>
              <label className="f"><span>Hire date *</span><input className="input" type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} required /></label>
              <label className="f"><span>System role</span>
                <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="employee">Employee</option><option value="manager">Manager</option><option value="hr">HR</option>
                </select>
              </label>
              <label className="f"><span>Department</span><input className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></label>
              <label className="f"><span>Job title</span><input className="input" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></label>
              <label className="f"><span>Reports to (manager)</span>
                <select className="select" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
                  <option value="">— none —</option>
                  {managers.filter((m) => m.id !== (editing !== 'new' && editing.id)).map((m) => <option key={m.id} value={m.id}>{m.fullNameEn} ({m.employeeCode})</option>)}
                </select>
              </label>
              <label className="f"><span>Pay type</span>
                <select className="select" value={form.payType} onChange={(e) => setForm({ ...form, payType: e.target.value })}>
                  <option value="salaried">Salaried (fixed monthly)</option>
                  <option value="hourly">Hourly wage</option>
                  <option value="commission">Commission / variable pay</option>
                </select>
              </label>
              {form.payType !== 'hourly' && (
                <>
                  <label className="f"><span>Basic salary (SAR)</span><input className="input" type="number" min="0" value={form.basicSalary} onChange={(e) => setForm({ ...form, basicSalary: e.target.value })} /></label>
                  <label className="f"><span>Housing allowance</span><input className="input" type="number" min="0" value={form.housingAllowance} onChange={(e) => setForm({ ...form, housingAllowance: e.target.value })} /></label>
                  <label className="f"><span>Transport allowance</span><input className="input" type="number" min="0" value={form.transportAllowance} onChange={(e) => setForm({ ...form, transportAllowance: e.target.value })} /></label>
                  <label className="f"><span>Other allowances</span><input className="input" type="number" min="0" value={form.otherAllowances} onChange={(e) => setForm({ ...form, otherAllowances: e.target.value })} /></label>
                </>
              )}
              {form.payType === 'hourly' && (
                <label className="f"><span>Hourly rate (SAR)</span><input className="input" type="number" min="0" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} /></label>
              )}
              {form.payType === 'commission' && (
                <label className="f"><span>Commission rate (% of sales)</span><input className="input" type="number" min="0" max="100" value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: e.target.value })} /></label>
              )}
              <label className="f"><span>Working week</span>
                <select className="select" value={form.workDays || 'sun_thur'} onChange={(e) => setForm({ ...form, workDays: e.target.value })}>
                  <option value="sun_thur">Sun – Thu (Saudi)</option><option value="mon_fri">Mon – Fri</option>
                </select>
              </label>
              <label className="f"><span>IBAN (bank)</span><input className="input" value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="SA…" /></label>
            </div>
            <div className="field-hint">GOSI is deducted on basic salary + housing allowance (max SAR 45,000). Salary must be paid by the 10th of the following month (WPS).</div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn" disabled={saving}>{saving ? 'Saving…' : editing === 'new' ? 'Create employee + login' : 'Save changes'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

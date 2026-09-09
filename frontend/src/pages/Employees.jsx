import { useCallback, useEffect, useState, useRef } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Modal, Badge, Loader, fmtMoney, fmtDate } from '../components/ui';

const EMPTY = {
  fullNameAr: '', fullNameEn: '', email: '', phone: '', nationalId: '', nationality: 'saudi',
  gosiScheme: 'systemB', hireDate: '', role: 'employee', department: '', jobTitle: '',
  managerId: '', payType: 'salaried', basicSalary: '', housingAllowance: '', transportAllowance: '',
  otherAllowances: '', hourlyRate: '', commissionRate: '', contractType: 'full_time', iban: '', status: 'active',
  pictureUrl: '', branchId: '', shiftId: '', fingerprintId: '', gender: 'male', birthDate: '',
};

export default function Employees() {
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const isHR = ['hr', 'admin'].includes(user.role);
  const isAdmin = user.role === 'admin';
  const [list, setList] = useState(null);
  const [branches, setBranches] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [q, setQ] = useState({ department: '', status: '', payType: '', search: '', role: '', branchId: '' });
  const [view, setView] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);
  const pictureInputRef = useRef(null);

  const load = useCallback(() => {
    setError('');
    const params = new URLSearchParams();
    if (isHR) {
      if (q.department) params.set('department', q.department);
      if (q.status) params.set('status', q.status);
      if (q.payType) params.set('payType', q.payType);
      if (q.search) params.set('search', q.search);
      if (q.role) params.set('role', q.role);
      if (q.branchId) params.set('branchId', q.branchId);
      params.set('finance', '1');
    }
    api('GET', `/api/employees?${params.toString()}`)
      .then((d) => setList(d.employees))
      .catch((e) => setError(e.message));
  }, [isHR, q]);

  const loadMeta = useCallback(() => {
    api('GET', '/api/branches').then(d => setBranches(d.branches || [])).catch(() => {});
    api('GET', '/api/shifts').then(d => setShifts(d.shifts || [])).catch(() => {});
  }, []);

  useEffect(load, [load]);
  useEffect(loadMeta, [loadMeta]);

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
        contractType: emp.contractType || 'full_time', iban: emp.fullIban || emp.iban || '', status: emp.status || 'active',
        pictureUrl: emp.pictureUrl || '', branchId: emp.branchId || '', shiftId: emp.shiftId || '',
        fingerprintId: emp.fingerprintId || '', gender: emp.gender || 'male', birthDate: emp.birthDate || '',
      });
    } else setForm(EMPTY);
    setEditing(emp || 'new');
  };

  const handlePictureChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('Picture must be less than 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm({ ...form, pictureUrl: ev.target.result });
    };
    reader.readAsDataURL(file);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = { ...form };
      for (const k of ['managerId', 'branchId', 'shiftId', 'basicSalary', 'housingAllowance', 'transportAllowance', 'otherAllowances', 'hourlyRate', 'commissionRate']) {
        if (payload[k] === '' || payload[k] === null) payload[k] = null;
        else if (['managerId', 'branchId', 'shiftId'].includes(k)) payload[k] = Number(payload[k]);
        else payload[k] = Number(payload[k]);
      }
      if (editing === 'new') {
        const r = await api('POST', '/api/employees', payload);
        setSuccess(r.credentials?.password ? 
          `${isRTL ? 'تم إنشاء الحساب' : 'Account created'}: ${r.credentials.email} - ${isRTL ? 'كلمة المرور المؤقتة' : 'Temp password'}: ${r.credentials.password}` : 
          (isRTL ? 'تم إنشاء الموظف' : 'Employee created'));
      } else {
        await api('PUT', `/api/employees/${editing.id}`, payload);
        setSuccess(isRTL ? 'تم تحديث الموظف' : 'Employee updated');
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteEmployee = async (emp) => {
    if (!window.confirm(t('employees.deleteConfirm'))) return;
    try {
      await api('DELETE', `/api/employees/${emp.id}`);
      setSuccess(t('employees.employeeDeleted'));
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const bulkDelete = async () => {
    if (selected.length === 0) return;
    if (!window.confirm(isRTL ? `هل أنت متأكد من حذف ${selected.length} موظف؟` : `Delete ${selected.length} employees?`)) return;
    try {
      await api('POST', '/api/employees/bulk-delete', { ids: selected });
      setSuccess(`${selected.length} ${isRTL ? 'موظف تم حذفه' : 'employees deleted'}`);
      setSelected([]);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const changeRole = async (emp, newRole) => {
    if (!window.confirm(isRTL ? `تغيير دور ${emp.fullNameEn} إلى ${newRole}؟` : `Change ${emp.fullNameEn}'s role to ${newRole}?`)) return;
    try {
      await api('PUT', `/api/employees/${emp.id}/role`, { role: newRole });
      setSuccess(`${isRTL ? 'تم تحديث الدور إلى' : 'Role updated to'} ${newRole}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetPin = async (emp) => {
    const pin = window.prompt(`${isRTL ? 'رمز جديد للجهاز' : 'New kiosk PIN (4 digits) for'} ${emp.fullNameEn}:`, '1234');
    if (!pin) return;
    try {
      await api('PUT', `/api/employees/${emp.id}/pin`, { pin: Number(pin) });
      setSuccess(`${t('employees.pinUpdated')} - ${emp.employeeCode}`);
    } catch (err) {
      setError(err.message);
    }
  };

  // Excel Import
  const handleExcelImport = async (e) => {
    e.preventDefault();
    if (!importFile) {
      setError('Please select Excel file');
      return;
    }
    setImporting(true);
    setImportResult(null);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/imports/employees/excel', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setImportResult(data);
      setSuccess(`Imported ${data.created} created, ${data.updated} updated`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/imports/template/employees', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'employee_import_template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!list && !error) return <Loader />;
  if (error && !list) return <Loader error={error} onRetry={load} />;

  const managers = list.filter((e) => ['manager', 'hr', 'admin'].includes(e.role));

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>{t('employees.title')}</h1>
          <p>
            {isAdmin && (isRTL ? 'إدارة كاملة - يمكنك إضافة وحذف وتعديل جميع الموظفين وتغيير الأدوار' : 'Full admin access - manage employees, branches, shifts')}
            {!isAdmin && isHR && t('employees.directory')}
            {user.role === 'manager' && t('employees.team')}
            {user.role === 'employee' && t('employees.ownRecord')}
          </p>
        </div>
        <div className="flex">
          {isAdmin && selected.length > 0 && (
            <button className="btn danger" onClick={bulkDelete}>
              🗑️ {isRTL ? `حذف (${selected.length})` : `Delete (${selected.length})`}
            </button>
          )}
          {isHR && (
            <>
              <button className="btn soft" onClick={() => setShowImport(true)}>📥 Import Excel</button>
              <button className="btn" onClick={() => openEdit(null)}>+ {t('employees.addEmployee')}</button>
            </>
          )}
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-ok">{success}</div>}

      {isHR && (
        <div className="card tight">
          <div className="flex" style={{ gap: 10 }}>
            <input className="input" style={{ maxWidth: 240 }} placeholder={t('employees.searchPlaceholder')} value={q.search} onChange={(e) => setQ({ ...q, search: e.target.value })} />
            <select className="select" style={{ maxWidth: 170 }} value={q.department} onChange={(e) => setQ({ ...q, department: e.target.value })}>
              <option value="">{t('employees.allDepartments')}</option>
              {['Human Resources', 'Sales & Operations', 'Warehouse', 'Sales', 'Customer Care', 'Finance', 'IT', 'Factory'].map((d) => <option key={d}>{d}</option>)}
            </select>
            <select className="select" style={{ maxWidth: 160 }} value={q.branchId} onChange={(e) => setQ({ ...q, branchId: e.target.value })}>
              <option value="">All Locations</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
            </select>
            <select className="select" style={{ maxWidth: 140 }} value={q.status} onChange={(e) => setQ({ ...q, status: e.target.value })}>
              <option value="">{t('employees.anyStatus')}</option>
              <option value="active">{t('common.active')}</option><option value="on_leave">On leave</option><option value="terminated">Terminated</option>
            </select>
            <select className="select" style={{ maxWidth: 140 }} value={q.role} onChange={(e) => setQ({ ...q, role: e.target.value })}>
              <option value="">{isRTL ? 'جميع الأدوار' : 'All roles'}</option>
              <option value="employee">{t('employees.employee')}</option>
              <option value="manager">{t('employees.manager')}</option>
              <option value="hr">{t('employees.hr')}</option>
              <option value="admin">{t('employees.admin')}</option>
            </select>
            <button className="btn ghost sm" onClick={load}>{t('employees.apply')}</button>
          </div>
        </div>
      )}

      <div className="tablewrap">
        <table className="tbl">
          <thead>
            <tr>
              {isAdmin && <th><input type="checkbox" onChange={(e) => setSelected(e.target.checked ? list.map(x => x.id) : [])} checked={selected.length === list.length && list.length > 0} /></th>}
              <th>Photo</th>
              <th>{t('employees.code')}</th><th>{t('common.name')}</th><th>{t('employees.role')}</th><th>Location</th><th>Shift</th>
              {isHR && <th className="num">{t('employees.monthlyWage')}</th>}
              <th>{t('common.status')}</th><th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id}>
                {isAdmin && <td><input type="checkbox" checked={selected.includes(e.id)} onChange={(e2) => setSelected(e2.target.checked ? [...selected, e.id] : selected.filter(id => id !== e.id))} /></td>}
                <td>
                  {e.pictureUrl ? (
                    <img src={e.pictureUrl} alt={e.fullNameEn} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--line)' }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--primary-lighter)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12, color: 'var(--primary-dark)' }}>
                      {e.fullNameEn.split(' ').map(s => s[0]).join('').slice(0,2)}
                    </div>
                  )}
                </td>
                <td><b style={{ color: 'var(--primary)' }}>{e.employeeCode}</b>{e.fingerprintId && <div style={{ fontSize: 10, color: 'var(--muted)' }}>FP: {e.fingerprintId}</div>}</td>
                <td>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{isRTL ? e.fullNameAr : e.fullNameEn}</div>
                  <small className="muted">{isRTL ? e.fullNameEn : e.fullNameAr} · {e.jobTitle}</small>
                  <div><small className="muted">{e.email}</small></div>
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Badge value={`role-${e.role}`} />
                    {isAdmin && (
                      <select className="select" style={{ fontSize: 11, padding: '2px 6px', maxWidth: 110 }} value={e.role} onChange={(ev) => changeRole(e, ev.target.value)}>
                        <option value="employee">{t('employees.employee')}</option>
                        <option value="manager">{t('employees.manager')}</option>
                        <option value="hr">{t('employees.hr')}</option>
                        <option value="admin">{t('employees.admin')}</option>
                      </select>
                    )}
                  </div>
                </td>
                <td>{e.branchName ? <><Badge value={e.branch?.type || 'branch'} /> <span style={{ fontSize: 12 }}>{e.branchName}</span></> : e.department || '—'}</td>
                <td>{e.shiftName ? <span style={{ fontSize: 12 }}>{e.shiftName}<br/><small>{e.shiftTime}</small></span> : '—'}</td>
                {isHR && <td className="num" style={{ fontWeight: 700 }}>{e.monthlyGross !== undefined ? fmtMoney(e.monthlyGross) : '—'}</td>}
                <td><Badge value={e.status} /></td>
                <td>
                  <div className="flex" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    <button className="btn ghost sm" onClick={() => openView(e)} title={t('common.view')}>👁️</button>
                    {isHR && (
                      <>
                        <button className="btn ghost sm" onClick={() => openEdit(e)} title={t('common.edit')}>✏️</button>
                        <button className="btn ghost sm" title={t('employees.resetPin')} onClick={() => resetPin(e)}>🔑</button>
                        {isAdmin && <button className="btn danger sm" title={t('common.delete')} onClick={() => deleteEmployee(e)}>🗑️</button>}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={isAdmin ? 10 : 9}><div className="empty"><div className="empty-icon">👥</div>{t('employees.noEmployees')}<br/><small>Import from Excel or add manually</small></div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {view && (
        <Modal title={`${isRTL ? view.employee.fullNameAr : view.employee.fullNameEn} · ${view.employee.employeeCode}`} onClose={() => setView(null)} wide>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
            {view.employee.pictureUrl ? (
              <img src={view.employee.pictureUrl} alt={view.employee.fullNameEn} style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--line)' }} />
            ) : (
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--primary-gradient)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 28, fontWeight: 800 }}>
                {view.employee.fullNameEn.split(' ').map(s => s[0]).join('').slice(0,2)}
              </div>
            )}
            <div>
              <h3 style={{ margin: 0 }}>{isRTL ? view.employee.fullNameAr : view.employee.fullNameEn}</h3>
              <p className="muted">{view.employee.jobTitle} · {view.employee.branchName || view.employee.department}</p>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <Badge value={view.employee.role} />
                <Badge value={view.employee.status} />
                {view.employee.shiftName && <Badge value={view.employee.shiftName} />}
              </div>
            </div>
          </div>
          <div className="grid2">
            <div>
              <h3>{t('employees.profile')}</h3>
              {[
                [t('employees.arabicName'), view.employee.fullNameAr], [t('employees.englishName'), view.employee.fullNameEn],
                [t('common.email'), view.employee.email], [t('common.phone'), view.employee.phone],
                [t('employees.jobTitle'), view.employee.jobTitle], [t('common.department'), view.employee.department],
                ['Branch', view.employee.branchName], ['Shift', view.employee.shiftName ? `${view.employee.shiftName} (${view.employee.shiftTime})` : null],
                ['Fingerprint ID', view.employee.fingerprintId], ['Gender', view.employee.gender],
                [t('employees.hireDate'), fmtDate(view.employee.hireDate)], [t('common.status'), view.employee.status],
                [t('employees.payType'), view.employee.payType], [t('employees.nationality'), view.employee.nationality],
              ].map(([k, v]) => (
                <div className="listitem" key={k}><span>{k}</span><b>{v || '—'}</b></div>
              ))}
            </div>
            <div>
              {view.employee.basicSalary !== undefined && (
                <>
                  <h3>{t('employees.compensation')}</h3>
                  <div className="listitem"><span>{t('employees.basicSalary')}</span><b>{fmtMoney(view.employee.basicSalary)}</b></div>
                  <div className="listitem"><span>{t('employees.housingAllowance')}</span><b>{fmtMoney(view.employee.housingAllowance)}</b></div>
                  <div className="listitem"><span>{t('employees.transportAllowance')}</span><b>{fmtMoney(view.employee.transportAllowance)}</b></div>
                  {view.employee.payType === 'hourly' && <div className="listitem"><span>{t('employees.hourlyRate')}</span><b>{fmtMoney(view.employee.hourlyRate)}/h</b></div>}
                  {view.employee.payType === 'commission' && <div className="listitem"><span>{t('employees.commissionRate')}</span><b>{view.employee.commissionRate}%</b></div>}
                  <div className="listitem"><span>{t('employees.monthlyWage')}</span><b>{fmtMoney(view.employee.monthlyGross)}</b></div>
                </>
              )}
              {view.balances && (
                <>
                  <h3>{t('employees.leaveBalances')}</h3>
                  <div className="listitem"><span>{isRTL ? 'السنوية المستحقة' : 'Annual accrued'}</span><b>{view.balances.annualAccrued} / {view.balances.annualEntitlement}</b></div>
                  <div className="listitem"><span>{isRTL ? 'السنوية المتاحة' : 'Annual available'}</span><b>{view.balances.annualAvailable} d</b></div>
                  <div className="listitem"><span>{isRTL ? 'المرضية' : 'Sick'}</span><b>{view.balances.sickAvailable} / 120</b></div>
                </>
              )}
            </div>
          </div>
          <div className="modal-foot">
            {isAdmin && <button className="btn danger" onClick={() => { setView(null); deleteEmployee(view.employee); }}>{t('common.delete')}</button>}
            <button className="btn ghost" onClick={() => setView(null)}>{t('common.close')}</button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={editing === 'new' ? t('employees.addEmployee') : `${t('common.edit')} ${isRTL ? editing.fullNameAr : editing.fullNameEn}`} onClose={() => setEditing(null)} wide>
          {error && <div className="form-error">{error}</div>}
          <form onSubmit={save}>
            <div className="avatar-upload">
              <div className="avatar-preview">
                {form.pictureUrl ? <img src={form.pictureUrl} alt="preview" /> : <span>👤</span>}
              </div>
              <div>
                <input ref={pictureInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePictureChange} />
                <button type="button" className="btn ghost sm" onClick={() => pictureInputRef.current?.click()}>📷 {form.pictureUrl ? 'Change Photo' : 'Upload Photo'}</button>
                {form.pictureUrl && <button type="button" className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => setForm({ ...form, pictureUrl: '' })}>Remove</button>}
                <div className="field-hint">Max 2MB, JPG/PNG</div>
              </div>
            </div>

            <div className="formgrid">
              <label className="f"><span>{t('employees.arabicName')} *</span><input className="input" value={form.fullNameAr} onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })} required /></label>
              <label className="f"><span>{t('employees.englishName')} *</span><input className="input" value={form.fullNameEn} onChange={(e) => setForm({ ...form, fullNameEn: e.target.value })} required /></label>
              <label className="f"><span>{t('employees.workEmail')} *</span><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
              <label className="f"><span>{t('common.phone')}</span><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
              <label className="f"><span>{t('employees.nationalId')}</span><input className="input" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} /></label>
              <label className="f"><span>Fingerprint ID (ZKTeco)</span><input className="input" value={form.fingerprintId} onChange={(e) => setForm({ ...form, fingerprintId: e.target.value })} placeholder="e.g. 101, 102..." /></label>
              <label className="f"><span>Gender</span>
                <select className="select" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="male">Male</option><option value="female">Female</option>
                </select>
              </label>
              <label className="f"><span>Birth Date</span><input className="input" type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></label>
              <label className="f"><span>{t('employees.nationality')}</span>
                <select className="select" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })}>
                  <option value="saudi">{isRTL ? 'سعودي' : 'Saudi'}</option><option value="gcc">{isRTL ? 'خليجي' : 'GCC'}</option><option value="expat">{isRTL ? 'مقيم' : 'Expat'}</option>
                </select>
              </label>
              <label className="f"><span>{t('employees.gosiScheme')}</span>
                <select className="select" value={form.gosiScheme} onChange={(e) => setForm({ ...form, gosiScheme: e.target.value })}>
                  <option value="systemB">System B (2024+)</option>
                  <option value="systemA">System A</option>
                  <option value="none">{isRTL ? 'غير مسجل' : 'None'}</option>
                </select>
              </label>
              <label className="f"><span>{t('employees.hireDate')} *</span><input className="input" type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} required /></label>
              <label className="f"><span>Branch / Location</span>
                <select className="select" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                  <option value="">-- Select Branch --</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code}) - {b.type}</option>)}
                </select>
              </label>
              <label className="f"><span>Shift / Time Table</span>
                <select className="select" value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}>
                  <option value="">-- Select Shift --</option>
                  {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</option>)}
                </select>
              </label>
              <label className="f"><span>{t('employees.systemRole')}</span>
                <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="employee">{t('employees.employee')}</option>
                  <option value="manager">{t('employees.manager')}</option>
                  <option value="hr">{t('employees.hr')}</option>
                  {isAdmin && <option value="admin">{t('employees.admin')}</option>}
                </select>
              </label>
              <label className="f"><span>{t('common.status')}</span>
                <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">{t('common.active')}</option>
                  <option value="on_leave">On leave</option>
                  <option value="terminated">Terminated</option>
                </select>
              </label>
              <label className="f"><span>{t('common.department')}</span><input className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></label>
              <label className="f"><span>{t('employees.jobTitle')}</span><input className="input" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></label>
              <label className="f"><span>{t('employees.reportsTo')}</span>
                <select className="select" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
                  <option value="">{isRTL ? '— لا يوجد —' : '— none —'}</option>
                  {managers.filter((m) => m.id !== (editing !== 'new' && editing.id)).map((m) => <option key={m.id} value={m.id}>{m.fullNameEn} ({m.employeeCode})</option>)}
                </select>
              </label>
              <label className="f"><span>{t('employees.payType')}</span>
                <select className="select" value={form.payType} onChange={(e) => setForm({ ...form, payType: e.target.value })}>
                  <option value="salaried">{t('employees.salaried')}</option>
                  <option value="hourly">{t('employees.hourly')}</option>
                  <option value="commission">{t('employees.commission')}</option>
                </select>
              </label>
              {form.payType !== 'hourly' && (
                <>
                  <label className="f"><span>{t('employees.basicSalary')} (SAR)</span><input className="input" type="number" min="0" value={form.basicSalary} onChange={(e) => setForm({ ...form, basicSalary: e.target.value })} /></label>
                  <label className="f"><span>{t('employees.housingAllowance')}</span><input className="input" type="number" min="0" value={form.housingAllowance} onChange={(e) => setForm({ ...form, housingAllowance: e.target.value })} /></label>
                  <label className="f"><span>{t('employees.transportAllowance')}</span><input className="input" type="number" min="0" value={form.transportAllowance} onChange={(e) => setForm({ ...form, transportAllowance: e.target.value })} /></label>
                </>
              )}
              {form.payType === 'hourly' && (
                <label className="f"><span>{t('employees.hourlyRate')} (SAR)</span><input className="input" type="number" min="0" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} /></label>
              )}
              <label className="f"><span>{t('employees.iban')}</span><input className="input" value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="SA…" /></label>
            </div>
            <div className="field-hint">{t('employees.gosiNote')}</div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
              <button className="btn" disabled={saving}>{saving ? t('common.loading') : editing === 'new' ? t('employees.createEmployee') : t('employees.saveChanges')}</button>
            </div>
          </form>
        </Modal>
      )}

      {showImport && (
        <Modal title="📥 Import Employees from Excel" onClose={() => { setShowImport(false); setImportResult(null); setImportFile(null); }} wide>
          <div style={{ marginBottom: 16 }}>
            <p className="muted" style={{ marginBottom: 12 }}>Upload Excel file with employee data. Supports .xlsx, .xls files. Flexible column names.</p>
            <button className="btn soft sm" onClick={downloadTemplate}>📄 Download Template</button>
            <div style={{ marginTop: 12, padding: 12, background: 'var(--bg)', borderRadius: 8, fontSize: 12 }}>
              <b>Required columns:</b> English Name or Arabic Name, Email (optional if you want auto-generation)<br/>
              <b>Optional:</b> Code, Phone, National ID, Nationality, Hire Date, Department, Job Title, Role, Branch Code, Shift Code, Fingerprint ID, Salary, etc.
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}
          {success && <div className="form-ok">{success}</div>}

          <form onSubmit={handleExcelImport}>
            <div className="file-drop" onClick={() => fileInputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setImportFile(f); }}>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => setImportFile(e.target.files[0] || null)} />
              <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
              <div style={{ fontWeight: 600 }}>{importFile ? importFile.name : 'Click or drag Excel file here'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{importFile ? `${(importFile.size / 1024).toFixed(1)} KB` : 'Supports .xlsx, .xls (max 10MB)'}</div>
            </div>

            {importResult && (
              <div className="import-result">
                <h4>Import Results</h4>
                <div className="import-stat">
                  <div className="ok">✅ {importResult.created} Created</div>
                  <div className="warn">🔄 {importResult.updated} Updated</div>
                  <div className="err">❌ {importResult.errors?.length || 0} Errors</div>
                  <div className="ok">📦 Batch: {importResult.batchId}</div>
                </div>
                {importResult.errors?.length > 0 && (
                  <div style={{ marginTop: 12, maxHeight: 150, overflow: 'auto', fontSize: 12, background: 'var(--danger-bg)', padding: 10, borderRadius: 6 }}>
                    {importResult.errors.slice(0, 20).map((err, i) => <div key={i}>Row {err.row}: {err.error}</div>)}
                    {importResult.errors.length > 20 && <div>...and {importResult.errors.length - 20} more</div>}
                  </div>
                )}
              </div>
            )}

            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setShowImport(false)}>Close</button>
              <button className="btn" disabled={importing || !importFile}>{importing ? 'Importing...' : '📥 Import Employees'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { Modal, Badge, Loader } from '../components/ui';

export default function Users() {
  const { t, isRTL } = useLanguage();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ email: '', role: 'employee', isActive: true, employeeId: '' });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setError('');
    api('GET', '/api/users')
      .then((d) => setUsers(d.users))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const openEdit = (user) => {
    if (user) {
      setForm({
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        employeeId: user.employeeId || '',
      });
    } else {
      setForm({ email: '', role: 'employee', isActive: true, employeeId: '' });
    }
    setEditing(user || 'new');
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (editing === 'new') {
        await api('POST', '/api/users', {
          email: form.email,
          role: form.role,
          employeeId: form.employeeId ? Number(form.employeeId) : null,
          password: Math.random().toString(36).slice(2, 10) + 'A1!',
        });
        setSuccess('User created successfully');
      } else {
        await api('PUT', `/api/users/${editing.id}`, {
          role: form.role,
          isActive: form.isActive,
          employeeId: form.employeeId ? Number(form.employeeId) : null,
        });
        setSuccess(t('users.userUpdated'));
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (user) => {
    if (!window.confirm(t('users.confirmDelete'))) return;
    try {
      await api('DELETE', `/api/users/${user.id}`);
      setSuccess(t('users.userDeleted'));
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetPassword = async (user) => {
    const newPass = window.prompt(`New password for ${user.email}:`, 'Demo@1234');
    if (!newPass) return;
    try {
      await api('PUT', `/api/users/${user.id}/password`, { newPassword: newPass });
      setSuccess(`${t('users.passwordReset')} for ${user.email}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleActive = async (user) => {
    try {
      await api('PUT', `/api/users/${user.id}`, { isActive: !user.isActive });
      setSuccess(user.isActive ? 'User deactivated' : 'User activated');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!users && !error) return <Loader />;
  if (error && !users) return <Loader error={error} onRetry={load} />;

  const filtered = users.filter(u => 
    !search || 
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase()) ||
    (u.employee && u.employee.fullNameEn.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>{t('users.title')}</h1>
          <p>{t('users.description')}</p>
        </div>
        <button className="btn" onClick={() => openEdit(null)}>
          + {t('users.addUser')}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-ok">{success}</div>}

      <div className="card tight">
        <div className="flex">
          <input
            className="input"
            style={{ maxWidth: 300 }}
            placeholder={isRTL ? 'ابحث بالبريد أو الدور...' : 'Search by email or role...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="chip">{filtered.length} users</div>
        </div>
      </div>

      <div className="tablewrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t('common.email')}</th>
              <th>{t('common.role')}</th>
              <th>{t('users.employeeLink')}</th>
              <th>{t('users.lastLogin')}</th>
              <th>{t('users.isActive')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{u.email}</div>
                  <small className="muted">ID: {u.id}</small>
                </td>
                <td><Badge value={`role-${u.role}`} /></td>
                <td>
                  {u.employee ? (
                    <div>
                      <div style={{ fontWeight: 600 }}>{u.employee.fullNameEn}</div>
                      <small className="muted">{u.employee.employeeCode} · {u.employee.department}</small>
                    </div>
                  ) : (
                    <span className="muted">— {isRTL ? 'غير مرتبط' : 'Not linked'} —</span>
                  )}
                </td>
                <td>
                  {u.lastLoginAt ? (
                    <small>{new Date(u.lastLoginAt).toLocaleDateString()}<br/>{new Date(u.lastLoginAt).toLocaleTimeString()}</small>
                  ) : (
                    <small className="muted">Never</small>
                  )}
                </td>
                <td>
                  <Badge value={u.isActive ? 'active' : 'inactive'} />
                </td>
                <td>
                  <div className="flex" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    <button className="btn ghost sm" onClick={() => openEdit(u)} title={t('common.edit')}>
                      {t('common.edit')}
                    </button>
                    <button className="btn ghost sm" onClick={() => resetPassword(u)} title={t('users.resetPassword')}>
                      🔑
                    </button>
                    <button className="btn ghost sm" onClick={() => toggleActive(u)} title={u.isActive ? t('users.deactivate') : t('users.activate')}>
                      {u.isActive ? '⏸️' : '▶️'}
                    </button>
                    <button className="btn danger sm" onClick={() => deleteUser(u)} title={t('common.delete')}>
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="6"><div className="empty">{t('users.noUsers')}</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing === 'new' ? t('users.addUser') : `${t('users.editUser')} - ${editing.email}`} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="formgrid">
              <label className="f">
                <span>{t('common.email')} *</span>
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  disabled={editing !== 'new'}
                  placeholder="user@company.sa"
                />
              </label>
              
              <label className="f">
                <span>{t('common.role')} *</span>
                <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="employee">{t('employees.employee')}</option>
                  <option value="manager">{t('employees.manager')}</option>
                  <option value="hr">{t('employees.hr')}</option>
                  <option value="admin">{t('employees.admin')}</option>
                </select>
                <div className="field-hint">
                  {form.role === 'admin' && (isRTL ? 'صلاحيات كاملة - يمكنه إدارة كل شيء' : 'Full access - can manage everything')}
                  {form.role === 'hr' && (isRTL ? 'إدارة الموظفين والرواتب والإجازات' : 'Manage employees, payroll, leave')}
                  {form.role === 'manager' && (isRTL ? 'إدارة فريقه فقط' : 'Manage his team only')}
                  {form.role === 'employee' && (isRTL ? 'عرض بياناته فقط' : 'View own data only')}
                </div>
              </label>

              <label className="f">
                <span>{t('users.employeeLink')}</span>
                <input
                  className="input"
                  type="number"
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  placeholder={isRTL ? 'معرف الموظف (اختياري)' : 'Employee ID (optional)'}
                />
              </label>

              <label className="f">
                <span>{t('users.isActive')}</span>
                <select className="select" value={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.value === 'true' })}>
                  <option value="true">{isRTL ? 'نشط' : 'Active'}</option>
                  <option value="false">{isRTL ? 'معطل' : 'Inactive'}</option>
                </select>
              </label>
            </div>

            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn" disabled={saving}>
                {saving ? t('common.loading') : editing === 'new' ? t('common.create') : t('common.update')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

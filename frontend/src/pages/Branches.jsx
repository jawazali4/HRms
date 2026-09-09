import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Modal, Badge, Loader } from '../components/ui';

const EMPTY = {
  code: '', name: '', nameAr: '', type: 'branch', city: '', address: '', phone: '', managerId: '', defaultShiftId: '', isActive: true
};

const TYPES = [
  { value: 'branch', label: 'Branch', labelAr: 'فرع', color: '#f59e0b' },
  { value: 'warehouse', label: 'Warehouse', labelAr: 'مستودع', color: '#059669' },
  { value: 'factory', label: 'Factory', labelAr: 'مصنع', color: '#7c3aed' },
  { value: 'head_office', label: 'Head Office', labelAr: 'المكتب الرئيسي', color: '#0f766e' },
];

export default function Branches() {
  const [list, setList] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const d = await api('GET', `/api/branches?${params.toString()}`);
      setList(d.branches || []);
      if (d.warning) setError(d.warning);
    } catch (e) {
      console.error('Branches load failed:', e);
      setError(e.message);
      setList([]);
    } finally {
      setLoading(false);
    }
    
    try {
      const sd = await api('GET', '/api/shifts');
      setShifts(sd.shifts || []);
    } catch {}
    try {
      const ed = await api('GET', '/api/employees?limit=1000');
      setEmployees(ed.employees || []);
    } catch {}
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (item) => {
    if (item) {
      setForm({
        code: item.code, name: item.name, nameAr: item.nameAr || '', type: item.type,
        city: item.city || '', address: item.address || '', phone: item.phone || '',
        managerId: item.managerId || '', defaultShiftId: item.defaultShiftId || '', isActive: item.isActive
      });
    } else {
      setForm(EMPTY);
    }
    setEditing(item || 'new');
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(''); setSuccess('');
    try {
      const payload = { ...form };
      if (!payload.managerId) delete payload.managerId;
      else payload.managerId = Number(payload.managerId);
      if (!payload.defaultShiftId) delete payload.defaultShiftId;
      else payload.defaultShiftId = Number(payload.defaultShiftId);

      if (editing === 'new') {
        await api('POST', '/api/branches', payload);
        setSuccess('Branch created successfully');
      } else {
        await api('PUT', `/api/branches/${editing.id}`, payload);
        setSuccess('Branch updated successfully');
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete branch ${item.name}? This cannot be undone.`)) return;
    try {
      await api('DELETE', `/api/branches/${item.id}`);
      setSuccess(`Branch ${item.code} deleted`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading && !list) return <Loader />;
  
  if (error && !list?.length) {
    return (
      <div>
        <div className="pagehead"><div><h1>🏢 Branches & Locations</h1></div></div>
        <div className="error-box" style={{ whiteSpace: 'pre-wrap' }}>
          <div>
            <b>Error loading branches:</b> {error}
            <div style={{ marginTop: 12 }}>
              <button className="btn sm" onClick={load}>🔄 Retry</button>
              <a className="btn sm ghost" href="/api/health/detailed" target="_blank" style={{ marginLeft: 8 }}>Check Health</a>
            </div>
            {error.includes('does not exist') && (
              <div style={{ marginTop: 12, padding: 10, background: 'var(--warning-bg)', borderRadius: 8, fontSize: 12 }}>
                Tables are being auto-created. Wait 10s and retry. Or force sync: 
                <button className="btn ghost sm" style={{ marginLeft: 6, fontSize: 11 }} onClick={async () => {
                  try {
                    const r = await fetch('/api/health/sync', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('hrms_token')}` } });
                    const j = await r.json();
                    alert(JSON.stringify(j, null, 2));
                    load();
                  } catch (e) { alert(e.message); }
                }}>Force Sync</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>🏢 Branches & Locations</h1>
          <p>Manage your branches, warehouses, factory and head office. Each location can have its own default shift and manager.</p>
        </div>
        <div className="flex">
          <button className="btn" onClick={() => openEdit(null)}>+ Add Location</button>
        </div>
      </div>

      {error && <div className="form-error" style={{ whiteSpace: 'pre-wrap' }}>{error} <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={load}>Retry</button></div>}
      {success && <div className="form-ok">{success}</div>}

      <div className="card tight">
        <div className="flex">
          <input className="input" style={{ maxWidth: 300 }} placeholder="Search by name, code or city..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn ghost sm" onClick={load}>Search</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TYPES.map(t => (
              <span key={t.value} className="chip" style={{ borderColor: t.color, color: t.color }}>
                <span style={{ background: t.color, width: 8, height: 8, borderRadius: '50%', display: 'inline-block', marginRight: 4 }}></span>
                {t.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid3">
        {(list || []).map(b => {
          const typeInfo = TYPES.find(x => x.value === b.type) || TYPES[0];
          return (
            <div key={b.id} className="card" style={{ marginBottom: 0, borderLeft: `4px solid ${typeInfo.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <b style={{ fontSize: 16 }}>{b.name}</b>
                    <Badge value={b.type} />
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{b.nameAr || ''} · {b.code}</div>
                </div>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: b.isActive ? '#059669' : '#94a3b8' }} title={b.isActive ? 'Active' : 'Inactive'}></div>
              </div>

              <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
                {b.city && <div>📍 {b.city}{b.address ? ` - ${b.address}` : ''}</div>}
                {b.phone && <div>📞 {b.phone}</div>}
                {b.manager && <div>👤 Manager: {b.manager.fullNameEn}</div>}
                {b.defaultShift && <div>🕒 Default: {b.defaultShift.name} ({b.defaultShift.startTime}-{b.defaultShift.endTime})</div>}
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <span className="chip">👥 {b.employeeCount || 0} employees</span>
                {b.city && <span className="chip">{b.city}</span>}
              </div>

              <div className="flex" style={{ justifyContent: 'flex-end', gap: 6 }}>
                <button className="btn ghost sm" onClick={() => openEdit(b)}>✏️ Edit</button>
                <button className="btn danger sm" onClick={() => remove(b)}>🗑️ Delete</button>
              </div>
            </div>
          );
        })}
        {(!list || list.length === 0) && !loading && (
          <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏢</div>
            <h3>No branches yet</h3>
            <p className="muted">Add your first branch, warehouse or factory to get started.</p>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => openEdit(null)}>+ Add Location</button>
          </div>
        )}
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Add New Location' : `Edit ${editing.name}`} onClose={() => setEditing(null)} wide>
          {error && <div className="form-error">{error}</div>}
          <form onSubmit={save}>
            <div className="formgrid">
              <label className="f"><span>Code * (e.g. BR-01, WH-01, FACTORY)</span>
                <input className="input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required placeholder="BR-01" />
              </label>
              <label className="f"><span>Name * (English)</span>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Main Branch" />
              </label>
              <label className="f"><span>Name (Arabic)</span>
                <input className="input" value={form.nameAr} onChange={e => setForm({ ...form, nameAr: e.target.value })} placeholder="الفرع الرئيسي" />
              </label>
              <label className="f"><span>Type *</span>
                <select className="select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {TYPES.map(t => <option key={t.value} value={t.value}>{t.label} - {t.labelAr}</option>)}
                </select>
              </label>
              <label className="f"><span>City</span>
                <input className="input" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Buraydah, Riyadh..." />
              </label>
              <label className="f"><span>Phone</span>
                <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+966..." />
              </label>
              <label className="f" style={{ gridColumn: '1/-1' }}><span>Address</span>
                <input className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Full address..." />
              </label>
              <label className="f"><span>Manager</span>
                <select className="select" value={form.managerId} onChange={e => setForm({ ...form, managerId: e.target.value })}>
                  <option value="">-- No manager --</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.fullNameEn} ({emp.employeeCode})</option>)}
                </select>
              </label>
              <label className="f"><span>Default Shift</span>
                <select className="select" value={form.defaultShiftId} onChange={e => setForm({ ...form, defaultShiftId: e.target.value })}>
                  <option value="">-- No default --</option>
                  {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</option>)}
                </select>
              </label>
              <label className="f"><span>Active</span>
                <select className="select" value={form.isActive ? '1' : '0'} onChange={e => setForm({ ...form, isActive: e.target.value === '1' })}>
                  <option value="1">Active</option>
                  <option value="0">Inactive</option>
                </select>
              </label>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn" disabled={saving}>{saving ? 'Saving...' : editing === 'new' ? 'Create Branch' : 'Save Changes'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

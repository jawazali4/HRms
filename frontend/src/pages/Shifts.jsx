import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Modal, Badge, Loader } from '../components/ui';

const EMPTY = {
  code: '', name: '', nameAr: '', startTime: '08:00', endTime: '17:00',
  breakStart: '12:00', breakEnd: '13:00', workDays: 'sun_thur',
  graceIn: 15, graceOut: 15, overtimeEnabled: true, branchId: '', color: '#0f766e', description: '', isActive: true
};

const WORKDAYS = [
  { value: 'sun_thur', label: 'Sun-Thu (Saudi)' },
  { value: 'sat_thu', label: 'Sat-Thu' },
  { value: 'mon_fri', label: 'Mon-Fri' },
  { value: 'sun_fri', label: 'Sun-Fri' },
  { value: 'sat_fri', label: 'Sat-Fri' },
];

const COLORS = ['#0f766e', '#059669', '#f59e0b', '#7c3aed', '#dc2626', '#2563eb', '#db2777', '#4b5563'];

export default function Shifts() {
  const [list, setList] = useState(null);
  const [branches, setBranches] = useState([]);
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
      const d = await api('GET', `/api/shifts?${params.toString()}`);
      setList(d.shifts || []);
      if (d.warning) setError(d.warning);
    } catch (e) {
      console.error('Shifts load failed:', e);
      setError(e.message);
      setList([]);
    } finally {
      setLoading(false);
    }
    try {
      const bd = await api('GET', '/api/branches');
      setBranches(bd.branches || []);
    } catch {}
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (item) => {
    if (item) {
      setForm({
        code: item.code, name: item.name, nameAr: item.nameAr || '',
        startTime: item.startTime, endTime: item.endTime,
        breakStart: item.breakStart || '12:00', breakEnd: item.breakEnd || '13:00',
        workDays: item.workDays, graceIn: item.graceIn, graceOut: item.graceOut,
        overtimeEnabled: item.overtimeEnabled, branchId: item.branchId || '',
        color: item.color || '#0f766e', description: item.description || '', isActive: item.isActive
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
      const payload = { ...form, graceIn: Number(form.graceIn), graceOut: Number(form.graceOut) };
      if (!payload.branchId) delete payload.branchId;
      else payload.branchId = Number(payload.branchId);

      if (editing === 'new') {
        await api('POST', '/api/shifts', payload);
        setSuccess('Shift created');
      } else {
        await api('PUT', `/api/shifts/${editing.id}`, payload);
        setSuccess('Shift updated');
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
    if (!window.confirm(`Delete shift ${item.name}?`)) return;
    try {
      await api('DELETE', `/api/shifts/${item.id}`);
      setSuccess(`Shift ${item.code} deleted`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading && !list) return <Loader />;

  if (error && !list?.length) {
    return (
      <div>
        <div className="pagehead"><div><h1>⏰ Shifts & Time Tables</h1></div></div>
        <div className="error-box" style={{ whiteSpace: 'pre-wrap' }}>
          <div>
            <b>Error loading shifts:</b> {error}
            <div style={{ marginTop: 12 }}>
              <button className="btn sm" onClick={load}>🔄 Retry</button>
              <a className="btn sm ghost" href="/api/health/detailed" target="_blank" style={{ marginLeft: 8 }}>Check Health</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>⏰ Shifts & Time Tables</h1>
          <p>Define different working hours for branches, warehouses and factory. Assign shifts to employees for accurate attendance tracking.</p>
        </div>
        <div className="flex">
          <button className="btn" onClick={() => openEdit(null)}>+ Add Shift</button>
        </div>
      </div>

      {error && <div className="form-error" style={{ whiteSpace: 'pre-wrap' }}>{error} <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={load}>Retry</button></div>}
      {success && <div className="form-ok">{success}</div>}

      <div className="card tight">
        <div className="flex">
          <input className="input" style={{ maxWidth: 300 }} placeholder="Search shifts..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn ghost sm" onClick={load}>Search</button>
        </div>
      </div>

      <div className="grid3">
        {(list || []).map(s => (
          <div key={s.id} className="card" style={{ marginBottom: 0, borderLeft: `4px solid ${s.color || '#0f766e'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 4, background: s.color }}></div>
                  <b style={{ fontSize: 16 }}>{s.name}</b>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.nameAr || ''} · {s.code}</div>
              </div>
              <Badge value={s.isActive ? 'active' : 'inactive'} />
            </div>

            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 12, marginBottom: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{s.startTime} - {s.endTime}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                Break: {s.breakStart}-{s.breakEnd} · Grace: {s.graceIn}m in / {s.graceOut}m out
              </div>
            </div>

            <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
              <div>📅 {WORKDAYS.find(w => w.value === s.workDays)?.label || s.workDays}</div>
              {s.branch && <div>🏢 {s.branch.name} ({s.branch.type})</div>}
              <div>⏱️ OT: {s.overtimeEnabled ? 'Enabled' : 'Disabled'}</div>
              {s.description && <div style={{ marginTop: 6, color: 'var(--muted)' }}>{s.description}</div>}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <span className="chip">👥 {s.employeeCount || 0} employees</span>
            </div>

            <div className="flex" style={{ justifyContent: 'flex-end', gap: 6 }}>
              <button className="btn ghost sm" onClick={() => openEdit(s)}>✏️ Edit</button>
              <button className="btn danger sm" onClick={() => remove(s)}>🗑️</button>
            </div>
          </div>
        ))}
        {(!list || list.length === 0) && !loading && (
          <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⏰</div>
            <h3>No shifts yet</h3>
            <p className="muted">Create your first shift timetable. Example: Morning 8-5, Night 11-8, Warehouse 7-4.</p>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => openEdit(null)}>+ Add Shift</button>
          </div>
        )}
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Add New Shift' : `Edit ${editing.name}`} onClose={() => setEditing(null)} wide>
          {error && <div className="form-error">{error}</div>}
          <form onSubmit={save}>
            <div className="formgrid">
              <label className="f"><span>Code * (e.g. MORNING, NIGHT, WH-SHIFT)</span>
                <input className="input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required placeholder="MORNING" />
              </label>
              <label className="f"><span>Name * (English)</span>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Morning Shift" />
              </label>
              <label className="f"><span>Name (Arabic)</span>
                <input className="input" value={form.nameAr} onChange={e => setForm({ ...form, nameAr: e.target.value })} placeholder="الوردية الصباحية" />
              </label>
              <label className="f"><span>Branch / Location</span>
                <select className="select" value={form.branchId} onChange={e => setForm({ ...form, branchId: e.target.value })}>
                  <option value="">-- All locations --</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code}) - {b.type}</option>)}
                </select>
              </label>
              <label className="f"><span>Start Time *</span>
                <input className="input" type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} required />
              </label>
              <label className="f"><span>End Time *</span>
                <input className="input" type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} required />
              </label>
              <label className="f"><span>Break Start</span>
                <input className="input" type="time" value={form.breakStart} onChange={e => setForm({ ...form, breakStart: e.target.value })} />
              </label>
              <label className="f"><span>Break End</span>
                <input className="input" type="time" value={form.breakEnd} onChange={e => setForm({ ...form, breakEnd: e.target.value })} />
              </label>
              <label className="f"><span>Work Days</span>
                <select className="select" value={form.workDays} onChange={e => setForm({ ...form, workDays: e.target.value })}>
                  {WORKDAYS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </label>
              <label className="f"><span>Grace In (late minutes)</span>
                <input className="input" type="number" min="0" max="120" value={form.graceIn} onChange={e => setForm({ ...form, graceIn: e.target.value })} />
              </label>
              <label className="f"><span>Grace Out (early minutes)</span>
                <input className="input" type="number" min="0" max="120" value={form.graceOut} onChange={e => setForm({ ...form, graceOut: e.target.value })} />
              </label>
              <label className="f"><span>Overtime</span>
                <select className="select" value={form.overtimeEnabled ? '1' : '0'} onChange={e => setForm({ ...form, overtimeEnabled: e.target.value === '1' })}>
                  <option value="1">Enabled</option>
                  <option value="0">Disabled</option>
                </select>
              </label>
              <label className="f"><span>Color</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {COLORS.map(c => (
                    <div key={c} onClick={() => setForm({ ...form, color: c })} style={{ width: 28, height: 28, borderRadius: 8, background: c, cursor: 'pointer', border: form.color === c ? '3px solid var(--ink)' : '2px solid transparent', boxShadow: 'var(--shadow-xs)' }}></div>
                  ))}
                </div>
              </label>
              <label className="f"><span>Active</span>
                <select className="select" value={form.isActive ? '1' : '0'} onChange={e => setForm({ ...form, isActive: e.target.value === '1' })}>
                  <option value="1">Active</option>
                  <option value="0">Inactive</option>
                </select>
              </label>
              <label className="f" style={{ gridColumn: '1/-1' }}><span>Description</span>
                <input className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional notes..." />
              </label>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn" disabled={saving}>{saving ? 'Saving...' : editing === 'new' ? 'Create Shift' : 'Save Changes'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

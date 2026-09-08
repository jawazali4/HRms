import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Badge, Modal, Loader, fmtDate, fmtMoney } from '../components/ui';

const CATS = ['Laptop', 'Desktop', 'Monitor', 'Mobile', 'Printer', 'Scanner', 'Furniture', 'Vehicle', 'Other'];

export default function Assets() {
  const { user } = useAuth();
  const isHR = ['hr', 'admin'].includes(user.role);
  const isManager = user.role === 'manager';
  const [assets, setAssets] = useState(null);
  const [allEmp, setAllEmp] = useState([]);
  const [open, setOpen] = useState(false);
  const [assign, setAssign] = useState(null);
  const [form, setForm] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('GET', '/api/assets').then((d) => setAssets(d.assets)).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  const ensureEmp = async () => {
    if (!allEmp.length) {
      try { setAllEmp((await api('GET', '/api/employees')).employees); } catch { /* */ }
    }
  };

  const openNew = async () => {
    setErr('');
    setForm({ assetCode: `AST-${1000 + (assets ? assets.length + 1 : 1)}`, name: '', category: 'Laptop', brand: '', serialNumber: '', purchaseDate: '', purchasePrice: '', notes: '' });
    await ensureEmp();
    setOpen(true);
  };
  const openEdit = async (a) => {
    setErr('');
    setForm({ ...a, purchasePrice: a.purchasePrice });
    await ensureEmp();
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      if (form.id) await api('PATCH', `/api/assets/${form.id}`, form);
      else await api('POST', '/api/assets', form);
      setOpen(false);
      load();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const doAssign = async (assetId, employeeId) => {
    try {
      await api('POST', `/api/assets/${assetId}/assign`, { assignedToId: employeeId || undefined });
      setAssign(null);
      load();
    } catch (ex) {
      alert(ex.message);
    }
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete asset ${a.assetCode}?`)) return;
    try {
      await api('DELETE', `/api/assets/${a.id}`);
      load();
    } catch (ex) {
      alert(ex.message);
    }
  };

  if (!assets) return <Loader />;

  const mine = user.employee ? assets.filter((a) => a.assignedToId === user.employee.id) : [];

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>Assets</h1>
          <p>
            {isHR && 'Register company assets and assign them to employees. Employees see only the assets assigned to them.'}
            {isManager && 'Assets assigned to your team.'}
            {!isHR && !isManager && 'Assets currently assigned to you.'}
          </p>
        </div>
        {isHR && <button className="btn" onClick={openNew}>+ Register asset</button>}
      </div>

      {err && <div className="error-box">{err}</div>}

      {!isHR && !isManager && (
        <div className="statgrid">
          <div className="stat"><div className="k">Assets assigned to me</div><div className="v">{mine.length}</div></div>
        </div>
      )}

      {isHR && (
        <div className="statgrid">
          <div className="stat"><div className="k">Total assets</div><div className="v">{assets.length}</div></div>
          <div className="stat"><div className="k">Available</div><div className="v">{assets.filter((a) => a.status === 'available').length}</div></div>
          <div className="stat"><div className="k">Assigned</div><div className="v">{assets.filter((a) => a.status === 'assigned').length}</div></div>
          <div className="stat"><div className="k">Maintenance</div><div className="v">{assets.filter((a) => a.status === 'maintenance').length}</div></div>
        </div>
      )}

      <div className="tablewrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Code</th><th>Asset</th><th>Category</th><th>Status</th><th>Assigned to</th><th className="num">Price</th>
              {(isHR || isManager) && <th></th>}
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id}>
                <td><b>{a.assetCode}</b></td>
                <td>
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  <small className="muted">{a.brand || ''}{a.serialNumber ? ` · S/N ${a.serialNumber}` : ''}</small>
                </td>
                <td>{a.category}</td>
                <td><Badge value={a.status} /></td>
                <td>{a.assignedTo ? `${a.assignedTo.employeeCode} · ${a.assignedTo.fullNameEn}` : '—'}</td>
                <td className="num">{a.purchasePrice ? fmtMoney(a.purchasePrice) : '—'}</td>
                {(isHR || isManager) && (
                  <td>
                    {isHR ? (
                      <div className="flex" style={{ gap: 5, justifyContent: 'flex-end' }}>
                        <button className="btn ghost sm" onClick={() => setAssign(a)}>{a.status === 'assigned' ? 'Reassign' : 'Assign'}</button>
                        <button className="btn ghost sm" onClick={() => openEdit(a)}>Edit</button>
                        <button className="btn ghost sm" onClick={() => remove(a)}>✕</button>
                      </div>
                    ) : a.status === 'available' ? <small className="muted">pool</small> : null}
                  </td>
                )}
              </tr>
            ))}
            {assets.length === 0 && <tr><td colSpan="7"><div className="empty">No assets found.</div></td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title={form.id ? `Edit ${form.assetCode}` : 'Register a new asset'} onClose={() => setOpen(false)}>
          <form onSubmit={save}>
            {err && <div className="form-error">{err}</div>}
            <div className="formgrid">
              <label className="f"><span>Asset code *</span><input className="input" value={form.assetCode} onChange={(e) => setForm({ ...form, assetCode: e.target.value })} required /></label>
              <label className="f"><span>Name *</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
              <label className="f"><span>Category</span>
                <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="f"><span>Brand</span><input className="input" value={form.brand || ''} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></label>
              <label className="f"><span>Serial number</span><input className="input" value={form.serialNumber || ''} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /></label>
              <label className="f"><span>Purchase date</span><input className="input" type="date" value={form.purchaseDate || ''} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></label>
              <label className="f"><span>Purchase price (SAR)</span><input className="input" type="number" value={form.purchasePrice || ''} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} /></label>
              <label className="f"><span>Notes</span><input className="input" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {assign && (
        <Modal title={`Assign ${assign.name} (${assign.assetCode})`} onClose={() => setAssign(null)}>
          {assign.status === 'assigned' && (
            <button className="btn ghost block" onClick={() => doAssign(assign.id, null)}>Return to available pool</button>
          )}
          <h3 style={{ margin: '12px 0 6px' }}>Assign to employee</h3>
          <div style={{ display: 'grid', gap: 6, maxHeight: 300, overflow: 'auto' }}>
            {allEmp.filter((e) => e.status === 'active').map((em) => (
              <button key={em.id} className="btn ghost" style={{ justifyContent: 'space-between' }} onClick={() => doAssign(assign.id, em.id)}>
                <span>{em.employeeCode} · {em.fullNameEn}</span><small>{em.department}</small>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, currentMonth } from '../api';
import { useAuth } from '../context/AuthContext';
import { Modal, Badge, Loader, fmtClock, fmtDate } from '../components/ui';

export default function Attendance() {
  const { user } = useAuth();
  const isHR = ['hr', 'admin'].includes(user.role);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [from, setFrom] = useState(`${currentMonth()}-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [manual, setManual] = useState(null);
  const [mForm, setMForm] = useState({ employeeId: '', date: new Date().toISOString().slice(0, 10), clockIn: '08:00', clockOut: '16:00', note: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [allEmp, setAllEmp] = useState([]);

  const load = useCallback(() => {
    setError('');
    api('GET', `/api/attendance?from=${from}&to=${to}&limit=500`)
      .then((d) => setRows(d.attendance))
      .catch((e) => setError(e.message));
  }, [from, to]);
  useEffect(load, [load]);

  useEffect(() => {
    if (isHR) {
      api('GET', '/api/employees').then((d) => setAllEmp(d.employees)).catch(() => {});
    }
  }, [isHR]);

  const openManual = async () => {
    setManual(true);
    setMsg('');
    setMForm({ ...mForm, date: new Date().toISOString().slice(0, 10) });
  };

  const submitManual = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      await api('POST', '/api/attendance', mForm);
      setMsg('Attendance saved.');
      setManual(false);
      load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeRow = async (id) => {
    if (!window.confirm('Delete this attendance record?')) return;
    try {
      await api('DELETE', `/api/attendance/${id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!rows) return <Loader />;

  const present = new Set(rows.filter((r) => r.clockIn).map((r) => `${r.employee ? r.employee.id : ''}:${r.date}`)).size;
  const totalHours = rows.reduce((s, r) => s + (r.hours || 0), 0);

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>Attendance</h1>
          <p>
            {isHR ? 'Every clock in/out from kiosks, mobile apps, web browsers and manual HR entries.' : 'Your clock in/out history.'}
            {' '}Hours shown are the clocked span in Asia/Riyadh time.
          </p>
        </div>
        <div className="row">
          <Link className="btn soft" to="/kiosk">Open kiosk</Link>
          {isHR && <button className="btn" onClick={openManual}>+ Manual entry</button>}
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="statgrid">
        <div className="stat"><div className="k">Records</div><div className="v">{rows.length}</div></div>
        <div className="stat"><div className="k">Employee-days present</div><div className="v">{present}</div></div>
        <div className="stat"><div className="k">Clocked hours</div><div className="v">{totalHours.toFixed(0)}h</div></div>
      </div>

      <div className="card tight">
        <div className="flex">
          <label className="f" style={{ margin: 0 }}><span>From</span><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="f" style={{ margin: 0 }}><span>To</span><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="btn ghost" onClick={load} style={{ alignSelf: 'flex-end' }}>Apply</button>
          {isHR && (
            <select className="select" style={{ alignSelf: 'flex-end' }} onChange={async (e) => {
              if (!e.target.value) return;
              setError('');
              try {
                const d = await api('GET', `/api/attendance?employeeId=${e.target.value}&from=${from}&to=${to}&limit=500`);
                setRows(d.attendance);
              } catch (err) { setError(err.message); }
              e.target.value = '';
            }}>
              <option value="">Filter by employee…</option>
              {(allEmp.length ? allEmp : []).map((em) => <option key={em.id} value={em.id}>{em.employeeCode} · {em.fullNameEn}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="tablewrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Date</th>
              {isHR || user.role === 'manager' ? <th>Employee</th> : null}
              <th>Clock in</th><th>Clock out</th><th className="num">Hours</th><th>Source</th>
              {isHR && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.date)}</td>
                {isHR || user.role === 'manager' ? <td>{r.employee ? `${r.employee.employeeCode} · ${r.employee.fullNameEn}` : r.employeeId}</td> : null}
                <td>{fmtClock(r.clockIn)}</td>
                <td>{r.clockOut ? fmtClock(r.clockOut) : <Badge value="open" />}</td>
                <td className="num">{r.hours ? r.hours.toFixed(2) : '—'}</td>
                <td><Badge value={r.source} /></td>
                {isHR && <td><button className="btn ghost sm" onClick={() => removeRow(r.id)}>✕</button></td>}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="8"><div className="empty">No attendance in this range.</div></td></tr>}
          </tbody>
        </table>
      </div>

      {manual && (
        <Modal title="Manual attendance entry (HR correction)" onClose={() => setManual(false)}>
          {msg && (msg.includes('saved') ? <div className="form-ok">{msg}</div> : <div className="form-error">{msg}</div>)}
          <form onSubmit={submitManual}>
            <div className="formgrid">
              <label className="f"><span>Employee</span>
                <select className="select" value={mForm.employeeId} onChange={(e) => setMForm({ ...mForm, employeeId: e.target.value })} required>
                  <option value="">Select…</option>
                  {allEmp.map((em) => <option key={em.id} value={em.id}>{em.employeeCode} · {em.fullNameEn}</option>)}
                </select>
              </label>
              <label className="f"><span>Date</span><input className="input" type="date" value={mForm.date} onChange={(e) => setMForm({ ...mForm, date: e.target.value })} required /></label>
              <label className="f"><span>Clock in (Riyadh)</span><input className="input" type="time" value={mForm.clockIn} onChange={(e) => setMForm({ ...mForm, clockIn: e.target.value })} required /></label>
              <label className="f"><span>Clock out</span><input className="input" type="time" value={mForm.clockOut} onChange={(e) => setMForm({ ...mForm, clockOut: e.target.value })} required /></label>
              <label className="f"><span>Note</span><input className="input" value={mForm.note} onChange={(e) => setMForm({ ...mForm, note: e.target.value })} placeholder="e.g. forgot to clock" /></label>
            </div>
            <div className="field-hint">Adding an entry for a date that already exists updates it (one record per employee per day).</div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setManual(false)}>Cancel</button>
              <button className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

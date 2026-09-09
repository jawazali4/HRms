import { useCallback, useEffect, useState, useRef } from 'react';
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
  const [showZKTeco, setShowZKTeco] = useState(false);
  const [zkFile, setZkFile] = useState(null);
  const [zkImporting, setZkImporting] = useState(false);
  const [zkResult, setZkResult] = useState(null);
  const zkFileRef = useRef(null);

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

  const handleZKTecoImport = async (e) => {
    e.preventDefault();
    if (!zkFile) {
      setError('Please select Excel file from ZKTeco device');
      return;
    }
    setZkImporting(true);
    setZkResult(null);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', zkFile);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/imports/attendance/zkteco', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setZkResult(data);
      setError('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setZkImporting(false);
    }
  };

  const downloadZKTecoTemplate = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/imports/template/zkteco', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zkteco_template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!rows && !error) return <Loader />;
  if (error && !rows) return <Loader error={error} onRetry={load} />;

  const present = new Set(rows.filter((r) => r.clockIn).map((r) => `${r.employee ? r.employee.id : ''}:${r.date}`)).size;
  const totalHours = rows.reduce((s, r) => s + (r.hours || 0), 0);
  const lateCount = rows.filter(r => r.isLate).length;

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>Attendance</h1>
          <p>
            {isHR ? 'Every clock in/out from ZKTeco fingerprint, kiosks, mobile, web and Excel imports.' : 'Your clock in/out history.'}
            {' '}Hours shown are in Asia/Riyadh time.
          </p>
        </div>
        <div className="row">
          <Link className="btn soft" to="/kiosk">Open kiosk</Link>
          {isHR && (
            <>
              <button className="btn soft" onClick={() => setShowZKTeco(true)}>🔐 Import ZKTeco Excel</button>
              <button className="btn" onClick={openManual}>+ Manual entry</button>
            </>
          )}
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="statgrid">
        <div className="stat"><div className="k">Records</div><div className="v">{rows.length}</div></div>
        <div className="stat"><div className="k">Employee-days present</div><div className="v">{present}</div></div>
        <div className="stat"><div className="k">Clocked hours</div><div className="v">{totalHours.toFixed(0)}h</div></div>
        <div className="stat"><div className="k">Late arrivals</div><div className="v" style={{ color: lateCount > 0 ? 'var(--danger)' : 'var(--success)' }}>{lateCount}</div></div>
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
              <th>Clock in</th><th>Clock out</th><th className="num">Hours</th><th>Late</th><th>Source</th><th>Branch/Shift</th>
              {isHR && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={r.isLate ? { background: 'var(--warning-bg)' } : {}}>
                <td>{fmtDate(r.date)}</td>
                {isHR || user.role === 'manager' ? <td>{r.employee ? `${r.employee.employeeCode} · ${r.employee.fullNameEn}` : r.employeeId}</td> : null}
                <td>{fmtClock(r.clockIn)}</td>
                <td>{r.clockOut ? fmtClock(r.clockOut) : <Badge value="open" />}</td>
                <td className="num">{r.hours ? r.hours.toFixed(2) : '—'}</td>
                <td>{r.isLate ? <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 12 }}>+{r.lateMinutes}m late</span> : <span style={{ color: 'var(--success)', fontSize: 12 }}>On time</span>}</td>
                <td><Badge value={r.source} />{r.deviceId && <small style={{ display: 'block', fontSize: 10 }}>{r.deviceId}</small>}</td>
                <td style={{ fontSize: 12 }}>{r.branch?.name || ''}{r.shift ? ` / ${r.shift.name}` : ''}</td>
                {isHR && <td><button className="btn ghost sm" onClick={() => removeRow(r.id)}>✕</button></td>}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="9"><div className="empty">No attendance in this range.</div></td></tr>}
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

      {showZKTeco && (
        <Modal title="🔐 Import ZKTeco Fingerprint Data" onClose={() => { setShowZKTeco(false); setZkResult(null); setZkFile(null); }} wide>
          <div style={{ marginBottom: 16 }}>
            <p className="muted" style={{ marginBottom: 12 }}>
              Upload Excel file exported from ZKTeco fingerprint machine. System auto-detects columns like Employee Code, Fingerprint ID, Date, Time, etc.
              Groups punches per day into Clock In / Clock Out.
            </p>
            <button className="btn soft sm" onClick={downloadZKTecoTemplate}>📄 Download ZKTeco Template</button>
            <div style={{ marginTop: 12, padding: 12, background: 'var(--bg)', borderRadius: 8, fontSize: 12, lineHeight: 1.6 }}>
              <b>Supported ZKTeco formats:</b><br/>
              • Columns: Employee ID / Code / Fingerprint ID, Date, Time, Punch Time, Check Type<br/>
              • Date formats: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY<br/>
              • Time formats: HH:mm, HH:mm:ss<br/>
              • Multiple punches per day → first = Clock In, last = Clock Out<br/>
              • Late detection based on employee's assigned shift
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}

          <form onSubmit={handleZKTecoImport}>
            <div className="file-drop" onClick={() => zkFileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setZkFile(f); }}>
              <input ref={zkFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => setZkFile(e.target.files[0] || null)} />
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔐</div>
              <div style={{ fontWeight: 600 }}>{zkFile ? zkFile.name : 'Click or drag ZKTeco Excel file here'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{zkFile ? `${(zkFile.size / 1024).toFixed(1)} KB` : 'Export from ZKTeco software → Excel'}</div>
            </div>

            {zkResult && (
              <div className="import-result">
                <h4>ZKTeco Import Results</h4>
                <div className="import-stat">
                  <div className="ok">✅ {zkResult.imported} Attendance Records</div>
                  <div className="ok">👥 {zkResult.employees} Employees</div>
                  <div className="warn">📅 {zkResult.dates} Days</div>
                  <div className="err">❌ {zkResult.errors?.length || 0} Errors</div>
                  <div className="ok">📦 Batch: {zkResult.batchId}</div>
                </div>
                {zkResult.errors?.length > 0 && (
                  <div style={{ marginTop: 12, maxHeight: 150, overflow: 'auto', fontSize: 12, background: 'var(--danger-bg)', padding: 10, borderRadius: 6 }}>
                    {zkResult.errors.slice(0, 20).map((err, i) => <div key={i}>Row {err.row}: {err.error}</div>)}
                    {zkResult.errors.length > 20 && <div>...and {zkResult.errors.length - 20} more</div>}
                  </div>
                )}
              </div>
            )}

            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setShowZKTeco(false)}>Close</button>
              <button className="btn" disabled={zkImporting || !zkFile}>{zkImporting ? 'Importing...' : '🔐 Import Fingerprint Data'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

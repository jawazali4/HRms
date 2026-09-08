import { useEffect, useState } from 'react';

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className="modal" style={wide ? { maxWidth: 860 } : undefined}>
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/* ---------- Status badge ---------- */
export function Badge({ value }) {
  if (value === null || value === undefined || value === '') return null;
  const v = String(value).toLowerCase();
  return <span className={`badge ${v.replace(/[^a-z0-9]/g, '_')}`}>{v}</span>;
}

/* ---------- Stat card ---------- */
export function Stat({ k, v, s }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {s ? <div className="s">{s}</div> : null}
    </div>
  );
}

/* ---------- tiny toast system ---------- */
export function ToastHost({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => onClose && onClose(), 4200);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div style={{ position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 300 }}>
      <div
        style={{
          background: toast.kind === 'error' ? '#b91c1c' : '#0f766e',
          color: '#fff', padding: '10px 18px', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,.3)',
          maxWidth: '92vw', fontSize: 13.5, fontWeight: 600,
        }}
      >
        {toast.msg}
      </div>
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState(null);
  const notify = (msg, kind = 'ok') => setToast({ msg, kind });
  return { toast, notify, ToastHost: <ToastHost toast={toast} onClose={() => setToast(null)} /> };
}

/* ---------- simple inline loading/error ---------- */
export function Loader() {
  return <div className="loading">Loading…</div>;
}
export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="error-box">⚠️ {error.message || String(error)}</div>;
}

export const fmtMoney = (n) =>
  `SAR ${Number(n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtClock = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

export const monthName = (ym) => {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || '';
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export const roleLabel = (r) => (r ? r.charAt(0).toUpperCase() + r.slice(1) : '');

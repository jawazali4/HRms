/**
 * Tiny API client. Uses relative "/api/..." URLs so the same build
 * works locally (Vite proxies /api to :4000) and on Netlify (the
 * /api redirect sends requests to the serverless function).
 */

const TOKEN_KEY = 'hrms_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(method, url, body, { raw = false, timeout = 45000, retries = 1 } = {}) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: payload,
        signal: controller.signal,
      });

      if (res.status === 401 && url !== '/api/auth/login') {
        setToken(null);
        window.dispatchEvent(new Event('hrms:logout'));
      }

      if (raw) {
        return res;
      }

      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: text.slice(0, 500) };
      }

      if (!res.ok) {
        // Handle 503 Database still starting — retry with backoff
        if (res.status === 503 && data.code === 'DB_INIT' && attempt < retries) {
          console.warn(`[hrms] Database still starting, retrying in ${1000 * (attempt + 1)}ms...`);
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }

        // Build detailed error message
        let errorMsg = data.error || `Request failed (${res.status})`;
        if (data.detail) {
          errorMsg += ` — ${data.detail.slice(0, 200)}`;
        }
        // Special handling for known DB errors
        if (data.code === 'DB_HOST_UNREACHABLE') {
          errorMsg = data.error; // Already user-friendly
        } else if (data.code === 'DB_AUTH') {
          errorMsg = data.error;
        } else if (res.status === 503) {
          errorMsg = `${data.error} Please wait a moment and try again.`;
        }

        const err = new Error(errorMsg);
        err.status = res.status;
        err.code = data.code;
        err.detail = data.detail;
        err.raw = data;
        throw err;
      }

      return data;
    } catch (err) {
      lastError = err;

      if (err.name === 'AbortError') {
        const e = new Error('The request took too long. Please try again.');
        e.status = 0;
        e.code = 'TIMEOUT';
        if (attempt < retries) {
          console.warn(`[hrms] Request timeout, retrying...`);
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw e;
      }

      // Don't retry on 4xx errors (except 503)
      if (err.status && err.status >= 400 && err.status < 500 && err.status !== 503) {
        throw err;
      }

      // Retry on network errors or 503
      if (attempt < retries && (!err.status || err.status === 503 || err.status === 0)) {
        console.warn(`[hrms] Request failed (attempt ${attempt + 1}), retrying...`, err.message);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }

      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

export const get = (url, opts) => api('GET', url, undefined, opts);
export const post = (url, body, opts) => api('POST', url, body, opts);
export const put = (url, body, opts) => api('PUT', url, body, opts);
export const del = (url, opts) => api('DELETE', url, undefined, opts);

/** Download a file (CSV/PDF) with the auth header attached. */
export async function download(url, filename) {
  const res = await api('GET', url, undefined, { raw: true });
  if (!res.ok) {
    const txt = await res.text();
    let errMsg = 'Download failed';
    try {
      const data = JSON.parse(txt);
      errMsg = data.error || errMsg;
    } catch {
      errMsg = txt.slice(0, 300) || errMsg;
    }
    throw new Error(errMsg);
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export const fmtSAR = (n) =>
  `SAR ${Number(n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const todayStr = () => new Date().toISOString().slice(0, 10);
export const currentMonth = () => new Date().toISOString().slice(0, 7);

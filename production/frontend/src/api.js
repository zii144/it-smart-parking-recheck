// Nullish coalescing (not ||) on purpose: the Docker build sets
// VITE_API_BASE="" so requests go to relative paths (same-origin, proxied
// to the backend container by nginx - see frontend/nginx.conf). An empty
// string is falsy but a deliberate, valid value, so it must not fall
// through to the localhost default the way `||` would make it.
const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

// In-memory bearer token (a signed JWT issued by the backend at login). Kept
// in module state rather than localStorage: the logged-in view itself isn't
// persisted across reloads (App re-shows the login screen on refresh), so
// there's nothing to gain from persisting the token, and keeping it out of
// storage avoids leaving a usable credential lying around.
let authToken = null;

export function setAuthToken(token) {
  authToken = token || null;
}

export function clearAuthToken() {
  authToken = null;
}

class ApiError extends Error {
  constructor(status, payload) {
    super(typeof payload === "string" ? payload : JSON.stringify(payload));
    this.status = status;
    this.payload = payload;
  }
}

function authHeaders(extra) {
  const headers = { ...(extra || {}) };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(body ? { "Content-Type": "application/json" } : undefined),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.detail ?? data);
  }
  return data;
}

function toQueryString(params) {
  const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  return `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`;
}

async function loginAndStoreToken(path, username, password) {
  const res = await request("POST", path, { username, password });
  setAuthToken(res.token);
  return res;
}

export const api = {
  login: (username, password) => loginAndStoreToken("/api/login", username, password),
  getLocations: () => request("GET", "/api/locations"),
  scanQr: (qr_code) => request("POST", "/api/qr/scan", { qr_code }),
  previewCase: (payload) => request("POST", "/api/cases/preview", payload),
  createCase: (payload) => request("POST", "/api/cases", payload),
  // The backend scopes this to the authenticated inspector; the username arg
  // is ignored server-side and kept only for call-site compatibility.
  listCases: () => request("GET", "/api/cases"),
};

export const adminApi = {
  login: (username, password) => loginAndStoreToken("/api/admin/login", username, password),
  listCases: (filters) => request("GET", `/api/admin/cases${toQueryString(filters)}`),
  getCase: (id) => request("GET", `/api/admin/cases/${id}`),
  reviewCase: (id, payload) => request("POST", `/api/admin/cases/${id}/review`, payload),
  updateCase: (id, payload) => request("PATCH", `/api/admin/cases/${id}`, payload),
  deleteCase: (id) => request("DELETE", `/api/admin/cases/${id}`),
  stats: () => request("GET", "/api/admin/stats"),
  // CSV export is now an admin-protected route, so it can't be a plain <a href>
  // download (that wouldn't carry the Authorization header). Fetch it with the
  // token and trigger a client-side blob download instead.
  downloadCsv: async () => {
    const res = await fetch(`${BASE}/api/admin/export.csv`, { headers: authHeaders() });
    if (!res.ok) {
      throw new ApiError(res.status, await res.text());
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "parking_cases_export.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  listInspectors: () => request("GET", "/api/admin/inspectors"),
  createInspector: (payload) => request("POST", "/api/admin/inspectors", payload),
  updateInspector: (username, payload) => request("PATCH", `/api/admin/inspectors/${encodeURIComponent(username)}`, payload),
  listLocations: () => request("GET", "/api/admin/locations"),
  createLocation: (payload) => request("POST", "/api/admin/locations", payload),
  deleteLocation: (id) => request("DELETE", `/api/admin/locations/${id}`),
  getSettings: () => request("GET", "/api/admin/settings"),
  updateSettings: (payload) => request("PUT", "/api/admin/settings", payload),
};

export { ApiError, BASE };

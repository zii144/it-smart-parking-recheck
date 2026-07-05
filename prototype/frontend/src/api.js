// Nullish coalescing (not ||) on purpose: the Docker build sets
// VITE_API_BASE="" so requests go to relative paths (same-origin, proxied
// to the backend container by nginx - see frontend/nginx.conf). An empty
// string is falsy but a deliberate, valid value, so it must not fall
// through to the localhost default the way `||` would make it.
const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

class ApiError extends Error {
  constructor(status, payload) {
    super(typeof payload === "string" ? payload : JSON.stringify(payload));
    this.status = status;
    this.payload = payload;
  }
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
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

export const api = {
  login: (username, password) => request("POST", "/api/login", { username, password }),
  getLocations: () => request("GET", "/api/locations"),
  scanQr: (qr_code) => request("POST", "/api/qr/scan", { qr_code }),
  previewCase: (payload) => request("POST", "/api/cases/preview", payload),
  createCase: (payload) => request("POST", "/api/cases", payload),
  listCases: (username) => request("GET", `/api/cases${username ? `?username=${encodeURIComponent(username)}` : ""}`),
};

export const adminApi = {
  login: (username, password) => request("POST", "/api/admin/login", { username, password }),
  listCases: (filters) => request("GET", `/api/admin/cases${toQueryString(filters)}`),
  getCase: (id) => request("GET", `/api/admin/cases/${id}`),
  reviewCase: (id, payload) => request("POST", `/api/admin/cases/${id}/review`, payload),
  stats: () => request("GET", "/api/admin/stats"),
  exportCsvUrl: () => `${BASE}/api/admin/export.csv`,
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

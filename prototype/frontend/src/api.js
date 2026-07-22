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

// Abort a request that never resolves (dead connection, captive portal, a
// backend hung mid-response) instead of leaving the caller's spinner spinning
// forever. Generous enough not to trip a slow-but-progressing photo upload.
const REQUEST_TIMEOUT_MS = 20000;

async function request(method, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: authHeaders(body ? { "Content-Type": "application/json" } : undefined),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  // Error bodies aren't always JSON — a crashed handler answers with plain
  // "Internal Server Error". Parsing must not throw here, or the caller sees a
  // generic SyntaxError instead of an ApiError carrying the real HTTP status
  // (and misreports a server bug as "backend not reachable").
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, data?.detail ?? data);
  }
  return data;
}

// Turn a login failure into a message that points at the actual problem: a
// response from the backend (bad credentials, throttle, disabled account,
// server bug) is a different situation from the backend being unreachable,
// and telling the user to "check the backend is running" for a 500 or a 429
// sends them debugging the wrong thing.
export function loginErrorMessage(err) {
  if (err instanceof ApiError) {
    if (err.status === 401) return "帳號或密碼錯誤";
    // 4xx details from the backend are deliberate, zh-TW, user-facing text
    // (e.g. 429 登入嘗試過於頻繁, 403 帳號已停用) — show them as-is.
    if (err.status < 500 && typeof err.payload === "string" && err.payload) {
      return err.payload;
    }
    return `後端服務發生錯誤（HTTP ${err.status}），請查看後端日誌後再試。`;
  }
  return "無法連線到後端 API，請確認後端服務已啟動 (http://localhost:8000)";
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
  // CSV/XLSX export are admin-protected routes, so they can't be plain <a href>
  // downloads (that wouldn't carry the Authorization header). Fetch with the
  // token and trigger a client-side blob download instead.
  downloadExport: async (format, filters = {}) => {
    const ext = format === "xlsx" ? "xlsx" : "csv";
    const res = await fetch(`${BASE}/api/admin/export.${ext}${toQueryString(filters)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      throw new ApiError(res.status, await res.text());
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parking_cases_export.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  downloadCsv: (filters) => adminApi.downloadExport("csv", filters),
  downloadXlsx: (filters) => adminApi.downloadExport("xlsx", filters),
  listInspectors: () => request("GET", "/api/admin/inspectors"),
  createInspector: (payload) => request("POST", "/api/admin/inspectors", payload),
  updateInspector: (username, payload) => request("PATCH", `/api/admin/inspectors/${encodeURIComponent(username)}`, payload),
  listAdmins: () => request("GET", "/api/admin/admins"),
  createAdmin: (payload) => request("POST", "/api/admin/admins", payload),
  updateAdmin: (username, payload) => request("PATCH", `/api/admin/admins/${encodeURIComponent(username)}`, payload),
  deleteAdmin: (username) => request("DELETE", `/api/admin/admins/${encodeURIComponent(username)}`),
  listLocations: () => request("GET", "/api/admin/locations"),
  createLocation: (payload) => request("POST", "/api/admin/locations", payload),
  deleteLocation: (id) => request("DELETE", `/api/admin/locations/${id}`),
  getSettings: () => request("GET", "/api/admin/settings"),
  updateSettings: (payload) => request("PUT", "/api/admin/settings", payload),
};

export { ApiError, BASE };

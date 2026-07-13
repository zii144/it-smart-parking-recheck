import { useState } from "react";
import { ShieldHalf, AlertCircle, LogIn, Loader2, ParkingCircle } from "lucide-react";
import { adminApi, loginErrorMessage } from "../../api";

export default function AdminLogin({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await adminApi.login(username, password);
      onLoggedIn(res.admin);
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell centered">
      <div className="card" style={{ maxWidth: 380, width: "100%" }}>
        <div className="card-icon-heading">
          <span className="icon-badge">
            <ShieldHalf size={20} />
          </span>
          <h1 style={{ fontSize: 19 }}>後台管理系統</h1>
        </div>
        <p className="muted small" style={{ marginTop: -8 }}>管理人員 / 系統管理員登入</p>
        <form onSubmit={handleSubmit}>
          <label>
            帳號
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </label>
          <label>
            密碼
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && (
            <div className="error-box">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          <button className="btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? <Loader2 size={16} className="spin-icon" /> : <LogIn size={16} />}
            {loading ? "登入中…" : "登入"}
          </button>
        </form>
        <p className="hint">
          Demo 帳號：<code>manager01</code> / <code>manager123</code>（管理人員）、
          <code>sysadmin01</code> / <code>sysadmin123</code>（系統管理員）
        </p>
        <a className="btn-link app-switch-link" href="/">
          <ParkingCircle size={13} /> 前往稽查員 APP
        </a>
      </div>
    </div>
  );
}

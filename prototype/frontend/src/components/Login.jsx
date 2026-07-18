import { useState } from "react";
import { ParkingCircle, AlertCircle, LogIn, Loader2 } from "lucide-react";
import { api, loginErrorMessage } from "../api";

export default function Login({ onLoggedIn }) {
  // Prefill the demo credentials only in dev builds — a production login screen
  // shouldn't ship (or hint at) working-looking credentials.
  const [username, setUsername] = useState(import.meta.env.DEV ? "insp01" : "");
  const [password, setPassword] = useState(import.meta.env.DEV ? "pass123" : "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.login(username, password);
      onLoggedIn(res.inspector, res.token);
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 380, width: "100%" }}>
      <div className="card-icon-heading">
        <span className="icon-badge">
          <ParkingCircle size={20} />
        </span>
        <div>
          <h1 style={{ fontSize: 19 }}>停車單稽查 APP</h1>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: -8 }}>稽查員登入</p>
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
      {import.meta.env.DEV && (
        <p className="hint">
          Demo 帳號：<code>insp01</code> / <code>pass123</code>（有稽查權限）、
          <code>insp02</code> / <code>pass123</code>（無稽查權限，示範無權限流程）
        </p>
      )}
    </div>
  );
}

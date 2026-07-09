import { useEffect, useState } from "react";
import { Users, UserPlus, Loader2 } from "lucide-react";
import { adminApi, ApiError } from "../../api";
import Spinner from "../../components/Spinner";

export default function AccountsManager() {
  const [inspectors, setInspectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ username: "", password: "", display_name: "", has_permission: true });
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [togglingUsername, setTogglingUsername] = useState(null);

  function load() {
    setLoading(true);
    adminApi.listInspectors().then(setInspectors).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleToggle(inspector) {
    setTogglingUsername(inspector.username);
    try {
      await adminApi.updateInspector(inspector.username, { has_permission: !inspector.has_permission });
      load();
    } finally {
      setTogglingUsername(null);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      await adminApi.createInspector(form);
      setForm({ username: "", password: "", display_name: "", has_permission: true });
      load();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? "帳號已存在" : "新增失敗");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="card">
      <div className="card-icon-heading">
        <span className="icon-badge">
          <Users size={18} />
        </span>
        <h2>稽查員帳號權限管理</h2>
      </div>

      {loading ? (
        <Spinner label="載入中…" />
      ) : (
        <div className="table-scroll">
          <table className="case-table">
            <thead>
              <tr>
                <th>帳號</th>
                <th>姓名</th>
                <th>稽查權限</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {inspectors.map((i) => (
                <tr key={i.username}>
                  <td>{i.username}</td>
                  <td>{i.display_name}</td>
                  <td>
                    <span className={`pill ${i.has_permission ? "pill-ok" : "pill-neutral"}`}>
                      {i.has_permission ? "有權限" : "無權限"}
                    </span>
                  </td>
                  <td>
                    <button className="btn-secondary" disabled={togglingUsername === i.username} onClick={() => handleToggle(i)}>
                      {togglingUsername === i.username && <Loader2 size={13} className="spin-icon" />}
                      {i.has_permission ? "取消權限" : "授予權限"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="divider" />
      <h3>
        <UserPlus size={15} /> 新增稽查員帳號
      </h3>
      <form onSubmit={handleCreate} className="inline-form">
        <label>
          帳號
          <input required value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
        </label>
        <label>
          密碼
          <input required value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        </label>
        <label>
          姓名
          <input required value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.has_permission}
            onChange={(e) => setForm((f) => ({ ...f, has_permission: e.target.checked }))}
          />
          具備稽查權限
        </label>
        {error && <div className="error-box">{error}</div>}
        <button className="btn-primary" type="submit" disabled={creating}>
          {creating ? <Loader2 size={15} className="spin-icon" /> : <UserPlus size={15} />}
          新增帳號
        </button>
      </form>
    </div>
  );
}

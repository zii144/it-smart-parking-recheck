import { useEffect, useState } from "react";
import { Users, UserPlus, Loader2, Pencil, Check, X, Trash2 } from "lucide-react";
import { adminApi, ApiError } from "../../api";
import Spinner from "../../components/Spinner";

function errText(err, fallback) {
  if (err instanceof ApiError) {
    if (err.status === 409) return "帳號已存在";
    if (typeof err.payload === "string") return err.payload;
  }
  return fallback;
}

const EMPTY_CREATE = { username: "", password: "", display_name: "", has_permission: true };

export default function InspectorAccounts() {
  const [inspectors, setInspectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_CREATE);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyUsername, setBusyUsername] = useState(null);

  // Inline row editor: { username, display_name, password } — one row at a time.
  const [editing, setEditing] = useState(null);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  function load() {
    setLoading(true);
    adminApi
      .listInspectors()
      .then((rows) => setInspectors(rows ?? []))
      .catch(() => setActionError("載入稽查員名單失敗，請重新整理。"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDelete(inspector) {
    setActionError("");
    if (
      !window.confirm(
        `確定要刪除稽查員「${inspector.display_name}（${inspector.username}）」嗎？此動作無法復原。`
      )
    ) {
      return;
    }
    setBusyUsername(inspector.username);
    try {
      await adminApi.deleteInspector(inspector.username);
      load();
    } catch (err) {
      setActionError(errText(err, "刪除失敗"));
    } finally {
      setBusyUsername(null);
    }
  }

  async function handleToggle(inspector) {
    setBusyUsername(inspector.username);
    setActionError("");
    try {
      await adminApi.updateInspector(inspector.username, { has_permission: !inspector.has_permission });
      load();
    } catch (err) {
      // Previously a failed permission toggle was swallowed with no feedback.
      setActionError(errText(err, "更新權限失敗，請稍後再試。"));
    } finally {
      setBusyUsername(null);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      await adminApi.createInspector(form);
      setForm(EMPTY_CREATE);
      load();
    } catch (err) {
      setError(errText(err, "新增失敗"));
    } finally {
      setCreating(false);
    }
  }

  function startEdit(inspector) {
    setEditError("");
    setEditing({ username: inspector.username, display_name: inspector.display_name, password: "" });
  }

  async function saveEdit() {
    setEditError("");
    const patch = { display_name: editing.display_name };
    if (editing.password) patch.password = editing.password;
    setSavingEdit(true);
    try {
      await adminApi.updateInspector(editing.username, patch);
      setEditing(null);
      load();
    } catch (err) {
      setEditError(errText(err, "更新失敗"));
    } finally {
      setSavingEdit(false);
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

      {actionError && <div className="error-box">{actionError}</div>}

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
              {inspectors.map((i) =>
                editing && editing.username === i.username ? (
                  <tr key={i.username} className="row-editing">
                    <td>{i.username}</td>
                    <td>
                      <input
                        value={editing.display_name}
                        onChange={(e) => setEditing((s) => ({ ...s, display_name: e.target.value }))}
                        placeholder="姓名"
                      />
                    </td>
                    <td colSpan={2}>
                      <div className="row-editor">
                        <input
                          type="password"
                          value={editing.password}
                          onChange={(e) => setEditing((s) => ({ ...s, password: e.target.value }))}
                          placeholder="新密碼（留空則不變更）"
                        />
                        <button className="btn-primary" disabled={savingEdit || !editing.display_name.trim()} onClick={saveEdit}>
                          {savingEdit ? <Loader2 size={13} className="spin-icon" /> : <Check size={13} />} 儲存
                        </button>
                        <button className="btn-secondary" disabled={savingEdit} onClick={() => setEditing(null)}>
                          <X size={13} /> 取消
                        </button>
                        {editError && <span className="inline-error">{editError}</span>}
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={i.username}>
                    <td>{i.username}</td>
                    <td>{i.display_name}</td>
                    <td>
                      <span className={`pill ${i.has_permission ? "pill-ok" : "pill-neutral"}`}>
                        {i.has_permission ? "有權限" : "無權限"}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn-secondary" disabled={busyUsername === i.username} onClick={() => handleToggle(i)}>
                          {busyUsername === i.username && <Loader2 size={13} className="spin-icon" />}
                          {i.has_permission ? "取消權限" : "授予權限"}
                        </button>
                        <button className="btn-secondary" onClick={() => startEdit(i)}>
                          <Pencil size={13} /> 編輯
                        </button>
                        <button
                          className="btn-danger"
                          disabled={busyUsername === i.username}
                          onClick={() => handleDelete(i)}
                        >
                          <Trash2 size={13} /> 刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
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
          <input required type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
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

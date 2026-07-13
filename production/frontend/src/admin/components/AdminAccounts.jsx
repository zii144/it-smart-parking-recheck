import { useEffect, useState } from "react";
import {
  ShieldHalf, UserPlus, Loader2, Pencil, Check, X, Power, Trash2, AlertCircle,
} from "lucide-react";
import { adminApi, ApiError } from "../../api";
import Spinner from "../../components/Spinner";

const ROLE_LABEL = { manager: "管理人員", sysadmin: "系統管理員" };
const ROLE_OPTIONS = [
  { value: "manager", label: "管理人員（複核 / 查詢 / 統計）" },
  { value: "sysadmin", label: "系統管理員（帳號 / 路段 / 設定）" },
];

const EMPTY_CREATE = { username: "", password: "", display_name: "", role: "manager" };

function errText(err, fallback) {
  if (err instanceof ApiError) {
    if (err.status === 409) return "帳號已存在";
    if (typeof err.payload === "string") return err.payload;
  }
  return fallback;
}

export default function AdminAccounts({ currentAdmin }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_CREATE);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busyUsername, setBusyUsername] = useState(null);

  // Inline row editor: { username, display_name, role, password }.
  const [editing, setEditing] = useState(null);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  function load() {
    setLoading(true);
    adminApi.listAdmins().then(setAdmins).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      await adminApi.createAdmin(form);
      setForm(EMPTY_CREATE);
      load();
    } catch (err) {
      setCreateError(errText(err, "新增失敗"));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(admin) {
    setActionError("");
    setBusyUsername(admin.username);
    try {
      await adminApi.updateAdmin(admin.username, { is_active: !admin.is_active });
      load();
    } catch (err) {
      setActionError(errText(err, "更新失敗"));
    } finally {
      setBusyUsername(null);
    }
  }

  async function handleDelete(admin) {
    setActionError("");
    if (!window.confirm(`確定要刪除帳號「${admin.display_name}（${admin.username}）」嗎？此動作無法復原。`)) {
      return;
    }
    setBusyUsername(admin.username);
    try {
      await adminApi.deleteAdmin(admin.username);
      load();
    } catch (err) {
      setActionError(errText(err, "刪除失敗"));
    } finally {
      setBusyUsername(null);
    }
  }

  function startEdit(admin) {
    setEditError("");
    setEditing({ username: admin.username, display_name: admin.display_name, role: admin.role, password: "" });
  }

  async function saveEdit() {
    setEditError("");
    const patch = { display_name: editing.display_name, role: editing.role };
    if (editing.password) patch.password = editing.password;
    setSavingEdit(true);
    try {
      await adminApi.updateAdmin(editing.username, patch);
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
          <ShieldHalf size={18} />
        </span>
        <h2>管理帳號管理</h2>
      </div>
      <p className="muted small" style={{ marginTop: -6 }}>
        建立與管理後台人員：管理人員負責案件複核／查詢／統計，系統管理員負責帳號／路段／系統設定。
      </p>

      {actionError && (
        <div className="error-box">
          <AlertCircle size={16} />
          <span>{actionError}</span>
        </div>
      )}

      {loading ? (
        <Spinner label="載入中…" />
      ) : (
        <div className="table-scroll">
          <table className="case-table">
            <thead>
              <tr>
                <th>帳號</th>
                <th>姓名</th>
                <th>角色</th>
                <th>狀態</th>
                <th>建立</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const isSelf = currentAdmin && a.username === currentAdmin.username;
                if (editing && editing.username === a.username) {
                  return (
                    <tr key={a.username} className="row-editing">
                      <td>{a.username}</td>
                      <td>
                        <input
                          value={editing.display_name}
                          onChange={(e) => setEditing((s) => ({ ...s, display_name: e.target.value }))}
                          placeholder="姓名"
                        />
                      </td>
                      <td colSpan={4}>
                        <div className="row-editor">
                          <select value={editing.role} onChange={(e) => setEditing((s) => ({ ...s, role: e.target.value }))}>
                            {ROLE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
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
                  );
                }
                return (
                  <tr key={a.username}>
                    <td>
                      {a.username}
                      {isSelf && <span className="self-tag">您</span>}
                    </td>
                    <td>{a.display_name}</td>
                    <td>
                      <span className={`pill ${a.role === "sysadmin" ? "pill-warn" : "pill-neutral"}`}>
                        {ROLE_LABEL[a.role] || a.role}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${a.is_active ? "pill-ok" : "pill-neutral"}`}>
                        {a.is_active ? "啟用" : "停用"}
                      </span>
                    </td>
                    <td className="muted small">
                      {a.created_by || "—"}
                      {a.created_at ? <><br />{a.created_at.slice(0, 10)}</> : null}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn-secondary" disabled={busyUsername === a.username} onClick={() => handleToggleActive(a)}>
                          {busyUsername === a.username ? <Loader2 size={13} className="spin-icon" /> : <Power size={13} />}
                          {a.is_active ? "停用" : "啟用"}
                        </button>
                        <button className="btn-secondary" onClick={() => startEdit(a)}>
                          <Pencil size={13} /> 編輯
                        </button>
                        <button
                          className="btn-danger"
                          disabled={isSelf || busyUsername === a.username}
                          title={isSelf ? "無法刪除自己的帳號" : "刪除帳號"}
                          onClick={() => handleDelete(a)}
                        >
                          <Trash2 size={13} /> 刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="divider" />
      <h3>
        <UserPlus size={15} /> 新增管理帳號
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
        <label>
          角色
          <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        {createError && <div className="error-box">{createError}</div>}
        <button className="btn-primary" type="submit" disabled={creating}>
          {creating ? <Loader2 size={15} className="spin-icon" /> : <UserPlus size={15} />}
          新增帳號
        </button>
      </form>
    </div>
  );
}

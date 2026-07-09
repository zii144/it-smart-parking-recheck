import { useEffect, useState } from "react";
import { MapPinned, Plus, Trash2, Loader2 } from "lucide-react";
import { adminApi, ApiError } from "../../api";
import Spinner from "../../components/Spinner";

export default function LocationsManager() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ district: "", road: "", spot_no: "" });
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  function load() {
    setLoading(true);
    adminApi.listLocations().then(setLocations).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      await adminApi.createLocation(form);
      setForm({ district: form.district, road: form.road, spot_no: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? "此停車格已存在" : "新增失敗");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id) {
    setDeletingId(id);
    try {
      await adminApi.deleteLocation(id);
      load();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="card">
      <div className="card-icon-heading">
        <span className="icon-badge">
          <MapPinned size={18} />
        </span>
        <h2>路段 / 停車格管理</h2>
      </div>
      <p className="muted small">此處新增或刪除的停車格，會即時反映在稽查員 APP 的「選擇稽查地點」清單中。</p>

      {loading ? (
        <Spinner label="載入中…" />
      ) : (
        <div className="table-scroll">
          <table className="case-table">
            <thead>
              <tr>
                <th>行政區</th>
                <th>路段</th>
                <th>停車格</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => (
                <tr key={loc.id}>
                  <td>{loc.district}</td>
                  <td>{loc.road}</td>
                  <td>{loc.spot_no}</td>
                  <td>
                    <button className="btn-secondary" disabled={deletingId === loc.id} onClick={() => handleDelete(loc.id)}>
                      {deletingId === loc.id ? <Loader2 size={13} className="spin-icon" /> : <Trash2 size={13} />}
                      刪除
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
        <Plus size={15} /> 新增停車格
      </h3>
      <form onSubmit={handleCreate} className="inline-form">
        <label>
          行政區
          <input required value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} />
        </label>
        <label>
          路段
          <input required value={form.road} onChange={(e) => setForm((f) => ({ ...f, road: e.target.value }))} />
        </label>
        <label>
          停車格編號
          <input required value={form.spot_no} onChange={(e) => setForm((f) => ({ ...f, spot_no: e.target.value }))} />
        </label>
        {error && <div className="error-box">{error}</div>}
        <button className="btn-primary" type="submit" disabled={creating}>
          {creating ? <Loader2 size={15} className="spin-icon" /> : <Plus size={15} />}
          新增
        </button>
      </form>
    </div>
  );
}

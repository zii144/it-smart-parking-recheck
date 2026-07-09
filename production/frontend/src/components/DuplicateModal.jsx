import { AlertTriangle, Undo2, Save, Loader2 } from "lucide-react";

export default function DuplicateModal({ existingCase, onSaveAnyway, onCancel, saving }) {
  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-icon">
          <AlertTriangle size={22} />
        </div>
        <h2>帳單編號重複</h2>
        <p className="muted small">此帳單編號已存在稽查案件中：</p>
        <ul className="kv-list">
          <li>
            <span>地點</span>
            <span>
              {existingCase.district} {existingCase.road} {existingCase.spot_no}
            </span>
          </li>
          <li>
            <span>建立稽查員</span>
            <span>{existingCase.inspector_username}</span>
          </li>
          <li>
            <span>建立時間</span>
            <span>{existingCase.created_at}</span>
          </li>
          <li>
            <span>目前狀態</span>
            <span>{existingCase.status}</span>
          </li>
        </ul>
        <div className="button-row">
          <button className="btn-secondary" onClick={onCancel} disabled={saving}>
            <Undo2 size={15} /> 取消儲存
          </button>
          <button className="btn-primary" onClick={onSaveAnyway} disabled={saving}>
            {saving ? <Loader2 size={15} className="spin-icon" /> : <Save size={15} />}
            {saving ? "儲存中…" : "仍然儲存"}
          </button>
        </div>
      </div>
    </div>
  );
}

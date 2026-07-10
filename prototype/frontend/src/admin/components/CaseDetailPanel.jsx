import { useState } from "react";
import {
  X, FileWarning, CheckCircle2, AlertTriangle, MessageSquareWarning, BadgeCheck, XCircle,
  HelpCircle, Loader2, Send, Pencil, Trash2, Save,
} from "lucide-react";
import { adminApi, BASE } from "../../api";
import { statusLabel } from "../../format";

const JUDGE_LABEL = {
  COMPLIANT: { text: "符合規定", cls: "pill-ok" },
  OVERDUE: { text: "開單逾時", cls: "pill-warn" },
  DATA_ERROR: { text: "資料異常", cls: "pill-error" },
  PARSE_ERROR: { text: "格式錯誤", cls: "pill-error" },
};

const OUTCOME_OPTIONS = [
  { value: "DATA_ERROR", label: "資料錯誤", desc: "複核認定資料錯誤", icon: FileWarning },
  { value: "DUPLICATE", label: "重複開單", desc: "複核認定重複", icon: AlertTriangle },
  { value: "NEED_INFO", label: "需補充資料", desc: "案件保持待複核，等待補充後再次確認", icon: HelpCircle },
  { value: "CONFIRMED", label: "確認異常", desc: "複核確認異常，結案", icon: BadgeCheck },
  { value: "DISMISSED", label: "排除異常", desc: "複核後排除異常，結案", icon: XCircle },
];

const toLocal = (iso) => (iso ? String(iso).slice(0, 16) : "");
const withSeconds = (v) => (v && v.length === 16 ? `${v}:00` : v);

export default function CaseDetailPanel({ caseData, mode, adminUsername, onClose, onReviewed, onChanged }) {
  const refresh = onChanged || onReviewed; // both parents pass a reload+close callback
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(() => ({
    ticket_no: caseData.ticket_no ?? "",
    plate_no: caseData.plate_no ?? "",
    district: caseData.district ?? "",
    road: caseData.road ?? "",
    spot_no: caseData.spot_no ?? "",
    amount: caseData.amount != null ? String(caseData.amount) : "",
    due_date: caseData.due_date ?? "",
    parking_date: caseData.parking_date ?? "",
    parking_start: toLocal(caseData.parking_start),
    parking_end: toLocal(caseData.parking_end),
  }));

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const judge = JUDGE_LABEL[caseData.judgement] ?? { text: caseData.judgement, cls: "pill-neutral" };
  const canReview = mode === "review" && ["REVIEW_REQUIRED", "REVIEW_NEED_INFO"].includes(caseData.status);

  async function handleSubmitReview() {
    if (!outcome) {
      setError("請選擇複核結果");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const updated = await adminApi.reviewCase(caseData.id, { outcome, note: note || null, reviewed_by: adminUsername });
      onReviewed(updated);
    } catch {
      setError("送出失敗，請稍後再試。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await adminApi.updateCase(caseData.id, {
        ...form,
        amount: form.amount === "" ? null : Number(form.amount),
        parking_start: withSeconds(form.parking_start),
        parking_end: withSeconds(form.parking_end),
      });
      refresh();
    } catch (e) {
      setError(e?.status === 409 ? "帳單編號已存在於其他案件。" : "儲存失敗，請稍後再試。");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`確定刪除案件 #${caseData.id}（${caseData.ticket_no}）？此動作無法復原。`)) return;
    setDeleting(true);
    setError("");
    try {
      await adminApi.deleteCase(caseData.id);
      refresh();
    } catch {
      setError("刪除失敗，請稍後再試。");
      setDeleting(false);
    }
  }

  const EDIT_FIELDS = [
    ["帳單編號", "ticket_no", "text"],
    ["車牌號碼", "plate_no", "text"],
    ["行政區", "district", "text"],
    ["路段", "road", "text"],
    ["停車格", "spot_no", "text"],
    ["應繳金額", "amount", "number"],
    ["繳費期限", "due_date", "date"],
    ["停車日期", "parking_date", "date"],
    ["停車開始時間", "parking_start", "datetime-local"],
    ["停車結束時間", "parking_end", "datetime-local"],
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card-header">
          <h2>案件詳情 #{caseData.id}{editing ? "（編輯中）" : ""}</h2>
          <button className="btn-ghost btn-icon-only" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="badge-row">
          <span className={`pill ${judge.cls}`}>{judge.text}</span>
          <span className={`pill ${statusLabel(caseData.status).cls}`}>{statusLabel(caseData.status).text}</span>
          {!!caseData.duplicate_warning && <span className="pill pill-error">重複警示</span>}
          {!!caseData.manual_corrected && <span className="pill pill-warn">稽查員已修正</span>}
        </div>

        {editing ? (
          <div className="edit-grid">
            {EDIT_FIELDS.map(([label, key, type]) => (
              <label key={key}>
                {label}
                <input type={type} value={form[key]} onChange={set(key)} />
              </label>
            ))}
          </div>
        ) : (
          <ul className="kv-list">
            <li><span>帳單編號</span><span>{caseData.ticket_no}</span></li>
            <li><span>車牌</span><span>{caseData.plate_no}</span></li>
            <li><span>地點</span><span>{caseData.district} {caseData.road} {caseData.spot_no}</span></li>
            {caseData.gps_lat != null && caseData.gps_lng != null && (
              <li>
                <span>GPS 定位</span>
                <span>
                  <a
                    href={`https://www.google.com/maps?q=${caseData.gps_lat},${caseData.gps_lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {caseData.gps_lat.toFixed(5)}, {caseData.gps_lng.toFixed(5)}
                  </a>
                </span>
              </li>
            )}
            <li><span>應繳金額</span><span>{caseData.amount}</span></li>
            <li><span>停車時段</span><span>{caseData.parking_start} ~ {caseData.parking_end}</span></li>
            <li><span>解析出的開單時間</span><span>{caseData.issue_datetime ?? "—"}</span></li>
            <li><span>時間差</span><span>{caseData.time_diff_minutes != null ? `${caseData.time_diff_minutes} 分鐘` : "—"}</span></li>
            <li><span>資料來源</span><span>{caseData.data_source}</span></li>
            <li><span>稽查員</span><span>{caseData.inspector_username}</span></li>
            <li><span>建立時間</span><span>{caseData.created_at}</span></li>
            {caseData.review_outcome && (
              <>
                <li><span>先前複核結果</span><span>{caseData.review_outcome}</span></li>
                <li><span>複核備註</span><span>{caseData.review_note || "—"}</span></li>
                <li><span>複核人員 / 時間</span><span>{caseData.reviewed_by} · {caseData.reviewed_at}</span></li>
              </>
            )}
          </ul>
        )}

        {!editing && (caseData.photo_path ? (
          <div className="photo-preview-wrap">
            <img className="photo-preview" src={`${BASE}${caseData.photo_path}`} alt="停車單照片" />
          </div>
        ) : (
          <p className="muted small">此案件沒有照片。</p>
        ))}

        {canReview && !editing && (
          <div className="review-form">
            <h3>
              <MessageSquareWarning size={15} /> 複核決定
            </h3>
            <div className="outcome-grid">
              {OUTCOME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`outcome-tile ${outcome === opt.value ? "selected" : ""}`}
                    onClick={() => setOutcome(opt.value)}
                  >
                    <span className="qr-tile-title">
                      <Icon size={14} /> {opt.label}
                    </span>
                    <span className="qr-tile-desc">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
            <label>
              複核備註（選填）
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="補充說明給稽查員或後續複核參考" />
            </label>
          </div>
        )}

        {!canReview && !editing && mode === "review" && (
          <div className="info-box success">
            <CheckCircle2 size={16} />
            <span>此案件已複核完成，無需再次處理。</span>
          </div>
        )}

        {error && (
          <div className="error-box" style={{ marginTop: 12 }}>
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Manager record management: edit / delete. */}
        <div className="button-row" style={{ justifyContent: "space-between", marginTop: 16 }}>
          {editing ? (
            <>
              <span />
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-secondary" disabled={saving} onClick={() => { setEditing(false); setError(""); }}>
                  取消
                </button>
                <button className="btn-primary" disabled={saving} onClick={handleSave}>
                  {saving ? <Loader2 size={15} className="spin-icon" /> : <Save size={15} />}
                  {saving ? "儲存中…" : "儲存變更"}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Destructive action separated on the left; forward actions
                  grouped on the right with the primary (送出複核結果) rightmost. */}
              <button className="btn-danger" disabled={deleting} onClick={handleDelete}>
                {deleting ? <Loader2 size={15} className="spin-icon" /> : <Trash2 size={15} />}
                {deleting ? "刪除中…" : "刪除案件"}
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-secondary" onClick={() => setEditing(true)}>
                  <Pencil size={15} /> 編輯資料
                </button>
                {canReview && (
                  <button className="btn-primary" disabled={submitting} onClick={handleSubmitReview}>
                    {submitting ? <Loader2 size={15} className="spin-icon" /> : <Send size={15} />}
                    {submitting ? "送出中…" : "送出複核結果"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

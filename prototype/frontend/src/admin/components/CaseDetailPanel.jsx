import { useState } from "react";
import {
  X, FileWarning, CheckCircle2, AlertTriangle, MessageSquareWarning, BadgeCheck, XCircle, HelpCircle, Loader2, Send,
} from "lucide-react";
import { adminApi, BASE } from "../../api";

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

export default function CaseDetailPanel({ caseData, mode, adminUsername, onClose, onReviewed }) {
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card-header">
          <h2>案件詳情 #{caseData.id}</h2>
          <button className="btn-ghost btn-icon-only" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="badge-row">
          <span className={`pill ${judge.cls}`}>{judge.text}</span>
          <span className="pill pill-neutral">{caseData.status}</span>
          {!!caseData.duplicate_warning && <span className="pill pill-error">重複警示</span>}
          {!!caseData.manual_corrected && <span className="pill pill-warn">稽查員已修正</span>}
        </div>

        <ul className="kv-list">
          <li><span>帳單編號</span><span>{caseData.ticket_no}</span></li>
          <li><span>車牌</span><span>{caseData.plate_no}</span></li>
          <li><span>地點</span><span>{caseData.district} {caseData.road} {caseData.spot_no}</span></li>
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

        {caseData.photo_path ? (
          <div className="photo-preview-wrap">
            <img className="photo-preview" src={`${BASE}${caseData.photo_path}`} alt="停車單照片" />
          </div>
        ) : (
          <p className="muted small">此案件沒有照片。</p>
        )}

        {canReview && (
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
            {error && (
              <div className="error-box">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}
            <div className="button-row">
              <button className="btn-secondary" onClick={onClose}>取消</button>
              <button className="btn-primary" disabled={submitting} onClick={handleSubmitReview}>
                {submitting ? <Loader2 size={15} className="spin-icon" /> : <Send size={15} />}
                {submitting ? "送出中…" : "送出複核結果"}
              </button>
            </div>
          </div>
        )}

        {!canReview && mode === "review" && (
          <div className="info-box success">
            <CheckCircle2 size={16} />
            <span>此案件已複核完成，無需再次處理。</span>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Gauge, CheckCircle2, AlertTriangle, FileWarning, AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { api } from "../api";
import Spinner from "./Spinner";

const LABELS = {
  COMPLIANT: { text: "符合規定", cls: "badge-ok", icon: CheckCircle2 },
  OVERDUE: { text: "開單逾時", cls: "badge-warn", icon: AlertTriangle },
  DATA_ERROR: { text: "資料異常（開單時間早於停車開始時間）", cls: "badge-error", icon: FileWarning },
  PARSE_ERROR: { text: "帳單編號格式錯誤", cls: "badge-error", icon: FileWarning },
};

export default function JudgmentBanner({ fields, onNext, onBack }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    api
      .previewCase({
        ticket_no: fields.ticket_no,
        parking_date: fields.parking_date,
        parking_start: fields.parking_start,
      })
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch(() => {
        // Network/server error (or offline — this step needs the backend).
        // Don't leave a blank card with no way out; show a recoverable error.
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fields.ticket_no, fields.parking_date, fields.parking_start, retry]);

  if (loading) {
    return (
      <div className="card">
        <Spinner label="系統解析帳單編號、計算開單時間差…" />
      </div>
    );
  }
  if (failed || !result) {
    return (
      <div className="card">
        <div className="card-icon-heading">
          <span className="icon-badge">
            <Gauge size={18} />
          </span>
          <h2>開單時效判定</h2>
        </div>
        <div className="error-box">
          <AlertCircle size={16} />
          <span>無法取得判定結果，請確認網路連線後重試（此步驟需要連線）。</span>
        </div>
        <div className="button-row">
          <button className="btn-secondary" onClick={onBack}>
            <ArrowLeft size={15} /> 返回修改資料
          </button>
          <button className="btn-primary" onClick={() => setRetry((r) => r + 1)}>
            重試
          </button>
        </div>
      </div>
    );
  }

  const label = LABELS[result.judgement] ?? { text: result.judgement, cls: "badge-warn", icon: AlertTriangle };
  const Icon = label.icon;
  const reviewRequired = result.judgement !== "COMPLIANT";

  return (
    <div className="card">
      <div className="card-icon-heading">
        <span className="icon-badge">
          <Gauge size={18} />
        </span>
        <h2>開單時效判定</h2>
      </div>
      <span className={`badge ${label.cls}`}>
        <Icon size={14} /> {label.text}
      </span>

      {result.error && (
        <div className="error-box">
          <AlertCircle size={16} />
          <span>{result.error}</span>
        </div>
      )}
      {!result.error && (
        <ul className="kv-list">
          <li>
            <span>解析出的開單員編號</span>
            <span>{result.inspector_code}</span>
          </li>
          <li>
            <span>組合出的開單時間</span>
            <span>{result.issue_datetime}</span>
          </li>
          <li>
            <span>時間差（開單時間－停車開始時間）</span>
            <span>{result.time_diff_minutes} 分鐘</span>
          </li>
        </ul>
      )}
      {reviewRequired && <p className="muted small">此案件將標記需後台複核。</p>}

      <div className="button-row">
        <button className="btn-secondary" onClick={onBack}>
          <ArrowLeft size={15} /> 返回修改資料
        </button>
        <button className="btn-primary" onClick={() => onNext(result)}>
          繼續：拍照存證 <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { ClipboardCheck, CheckCircle2, FileWarning, PenLine, ArrowLeft, ArrowRight, Globe, MapPin } from "lucide-react";

const EMPTY = {
  ticket_no: "",
  plate_no: "",
  amount: "",
  due_date: "",
  parking_date: "",
  parking_start: "",
  parking_end: "",
};

function toDatetimeLocal(iso) {
  if (!iso) return "";
  return iso.length >= 16 ? iso.slice(0, 16) : iso;
}

export default function ConfirmForm({ scanResult, savedFields, onConfirmed, onBack }) {
  // Baseline = the values the scan auto-filled (or EMPTY for manual entry).
  // Used to detect whether the inspector manually corrected anything.
  const scanBaseline = useMemo(() => {
    if (scanResult.status === "success") {
      const t = scanResult.ticket;
      return {
        ticket_no: t.ticket_no,
        plate_no: t.plate_no,
        amount: String(t.amount),
        due_date: t.due_date,
        parking_date: t.parking_date,
        parking_start: toDatetimeLocal(t.parking_start),
        parking_end: toDatetimeLocal(t.parking_end),
      };
    }
    return EMPTY;
  }, [scanResult]);

  // Editable starting values: prefer anything already saved on this draft
  // (so jumping back to 確認 preserves the inspector's edits) over the scan
  // baseline.
  const initial = useMemo(() => {
    if (savedFields) {
      return {
        ticket_no: savedFields.ticket_no ?? "",
        plate_no: savedFields.plate_no ?? "",
        amount: savedFields.amount != null ? String(savedFields.amount) : "",
        due_date: savedFields.due_date ?? "",
        parking_date: savedFields.parking_date ?? "",
        parking_start: toDatetimeLocal(savedFields.parking_start),
        parking_end: toDatetimeLocal(savedFields.parking_end),
      };
    }
    return scanBaseline;
    // Snapshot once on mount; later saves shouldn't stomp in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [fields, setFields] = useState(initial);

  function update(key, value) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();

    const changedKeys = Object.keys(scanBaseline).filter((k) => (scanBaseline[k] || "") !== (fields[k] || ""));
    const isAutoFilled = scanResult.status === "success";
    const manualCorrected = isAutoFilled && changedKeys.length > 0;
    const originalValues = manualCorrected
      ? Object.fromEntries(changedKeys.map((k) => [k, scanBaseline[k]]))
      : null;

    onConfirmed({
      fields: {
        ...fields,
        amount: Number(fields.amount),
        parking_start: fields.parking_start.length === 16 ? `${fields.parking_start}:00` : fields.parking_start,
        parking_end: fields.parking_end.length === 16 ? `${fields.parking_end}:00` : fields.parking_end,
      },
      manualCorrected,
      originalValues,
    });
  }

  return (
    <div className="card">
      <div className="card-icon-heading">
        <span className="icon-badge">
          <ClipboardCheck size={18} />
        </span>
        <h2>確認資料內容</h2>
      </div>

      {scanResult.status === "fetch_failed" && (
        <div className="info-box">
          <FileWarning size={16} />
          <div>
            <p style={{ margin: "0 0 6px" }}>APP 無法讀取 QR 查詢頁資料，請依查詢頁內容手動填寫：</p>
            <p className="muted small" style={{ margin: "0 0 6px" }}>查詢網址：{scanResult.query_url}</p>
            <pre className="page-preview">{scanResult.page_preview}</pre>
          </div>
        </div>
      )}
      {scanResult.status === "scan_failed" && (
        <div className="info-box">
          <PenLine size={16} />
          <span>QR Code 掃描失敗，請依紙本停車單內容人工輸入。</span>
        </div>
      )}
      {scanResult.status === "success" && !scanResult.webInfo && (
        <div className="info-box success">
          <CheckCircle2 size={16} />
          <span>已自動帶入 QR 查詢頁資料，請確認內容是否正確。</span>
        </div>
      )}
      {scanResult.status === "success" && scanResult.webInfo && (
        <div className="info-box success">
          <Globe size={16} />
          <div>
            <p style={{ margin: "0 0 4px" }}>
              已由<strong>臺北市停車繳費系統</strong>線上查詢並自動帶入車牌與停車資訊，請確認內容是否正確。
            </p>
            <p className="muted small" style={{ margin: "0 0 6px" }}>
              來源：{scanResult.webInfo.source_host}
              {scanResult.webInfo.final_host ? ` → ${scanResult.webInfo.final_host}` : ""}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <span className={`pill ${scanResult.webInfo.paid ? "pill-ok" : "pill-warn"}`}>
                {scanResult.webInfo.paid ? "已繳費" : "未繳費"}
              </span>
              {scanResult.webInfo.rate && <span className="pill pill-neutral">費率：{scanResult.webInfo.rate}</span>}
              {scanResult.webInfo.amount_is_discounted && (
                <span className="pill pill-neutral">金額為行動支付優惠後</span>
              )}
            </div>
            <p className="muted small" style={{ margin: "8px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
              <MapPin size={12} /> 停車地點 / 行政區未隨帳單提供，請於上一步確認稽查地點。
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <label>
          帳單編號
          <input value={fields.ticket_no} onChange={(e) => update("ticket_no", e.target.value)} required />
        </label>
        <label>
          車牌號碼
          <input value={fields.plate_no} onChange={(e) => update("plate_no", e.target.value)} required />
        </label>
        <label>
          應繳金額
          <input type="number" value={fields.amount} onChange={(e) => update("amount", e.target.value)} required />
        </label>
        <label>
          繳費期限
          <input type="date" value={fields.due_date} onChange={(e) => update("due_date", e.target.value)} required />
        </label>
        <label>
          停車日期
          <input type="date" value={fields.parking_date} onChange={(e) => update("parking_date", e.target.value)} required />
        </label>
        <label>
          停車開始時間
          <input
            type="datetime-local"
            value={fields.parking_start}
            onChange={(e) => update("parking_start", e.target.value)}
            required
          />
        </label>
        <label>
          停車結束時間
          <input
            type="datetime-local"
            value={fields.parking_end}
            onChange={(e) => update("parking_end", e.target.value)}
            required
          />
        </label>

        <div className="button-row">
          <button type="button" className="btn-secondary" onClick={onBack}>
            <ArrowLeft size={15} /> 返回上一步
          </button>
          <button type="submit" className="btn-primary">
            確認資料，計算開單時效 <ArrowRight size={15} />
          </button>
        </div>
      </form>
    </div>
  );
}

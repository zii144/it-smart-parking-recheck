import { useState } from "react";
import { QrCode, CheckCircle2, AlertTriangle, FileWarning, ScanLine, PenLine } from "lucide-react";
import { api } from "../api";
import Spinner from "./Spinner";

// There's no real camera/QR decoder in this prototype (per project scope
// decision) - scanning is simulated by picking one of the demo QR codes
// below, each wired to a specific scenario in backend/app/seed.py.
const DEMO_CODES = [
  { code: "QR-A1001", label: "QR-A1001", desc: "成功讀取・符合規定・會觸發重複警示", accent: "success", icon: CheckCircle2 },
  { code: "QR-A1002", label: "QR-A1002", desc: "成功讀取・開單逾時", accent: "warning", icon: AlertTriangle },
  { code: "QR-A1003", label: "QR-A1003", desc: "成功讀取・資料異常（開單時間早於停車時間）", accent: "danger", icon: FileWarning },
  { code: "QR-A1004", label: "QR-A1004", desc: "成功讀取・符合規定・無重複", accent: "success", icon: CheckCircle2 },
  { code: "QR-A1005", label: "QR-A1005", desc: "QR 解碼成功但查詢頁讀取失敗", accent: "warning", icon: AlertTriangle },
  { code: "QR-BAD-SCAN", label: "QR-BAD-SCAN", desc: "模擬掃描失敗（無法辨識的 QR）", accent: "neutral", icon: FileWarning },
];

export default function QRScan({ onResult, onManualFallback }) {
  const [scanning, setScanning] = useState(false);
  const [customCode, setCustomCode] = useState("");

  async function doScan(code) {
    setScanning(true);
    try {
      const res = await api.scanQr(code);
      if (res.status === "success") {
        onResult({ status: "success", dataSource: "AUTO_QR", ticket: res.ticket });
      } else if (res.status === "fetch_failed") {
        onResult({
          status: "fetch_failed",
          dataSource: "MANUAL_FROM_QR_PAGE",
          query_url: res.query_url,
          page_preview: res.page_preview,
        });
      } else {
        onResult({ status: "scan_failed", dataSource: "MANUAL_FROM_TICKET" });
      }
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="card">
      <div className="card-icon-heading">
        <span className="icon-badge">
          <QrCode size={18} />
        </span>
        <h2>掃描停車單 QR Code</h2>
      </div>
      <p className="muted small">
        本原型沒有真實相機掃描，請點選下列示範 QR Code 模擬掃描結果：
      </p>
      <div className="qr-grid">
        {DEMO_CODES.map((d) => {
          const Icon = d.icon;
          return (
            <button
              key={d.code}
              className={`qr-tile accent-${d.accent}`}
              disabled={scanning}
              onClick={() => doScan(d.code)}
            >
              <span className="qr-tile-title">
                <Icon size={14} />
                {d.label}
              </span>
              <span className="qr-tile-desc">{d.desc}</span>
            </button>
          );
        })}
      </div>
      <div className="divider" />
      <label>
        或輸入任意 QR 內容測試「掃描失敗」情境
        <input value={customCode} onChange={(e) => setCustomCode(e.target.value)} placeholder="例如 UNKNOWN-CODE" />
      </label>
      <button className="btn-secondary" disabled={scanning || !customCode} onClick={() => doScan(customCode)}>
        <ScanLine size={15} /> 掃描
      </button>
      <div className="divider" />
      <button className="btn-link" onClick={onManualFallback}>
        <PenLine size={14} /> 直接人工輸入帳單資料
      </button>
      {scanning && <Spinner label="掃描中…" />}
    </div>
  );
}

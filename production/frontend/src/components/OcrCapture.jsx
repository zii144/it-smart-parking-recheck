import { useState } from "react";
import { ScanLine, ImagePlus, Loader2, ArrowRight, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";
import { parseTicketText } from "../ocrParse";

// OCR alternative to QR scanning: the inspector photographs the ticket, the
// browser runs on-device text recognition (tesseract.js, loaded lazily), and
// the recognised fields pre-fill the flow. OCR is best-effort, so the result is
// always confirmed/corrected on the next step and the case is flagged for
// back-office review (data_source = "OCR").
export default function OcrCapture({ onResult }) {
  const [preview, setPreview] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | recognizing | done | error
  const [progress, setProgress] = useState(0);
  const [fields, setFields] = useState(null);
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setPhase("recognizing");
    setProgress(0);
    setError("");
    setFields(null);
    try {
      const { createWorker } = await import("tesseract.js");
      // chi_tra + eng: the ticket mixes Chinese labels/values (區組/停車地點/
      // 車位編號) with latin ticket numbers and plates, and the location
      // fields are only recognisable with the Traditional Chinese model.
      const worker = await createWorker("chi_tra+eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100));
        },
      });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      setRawText(data.text);
      setFields(parseTicketText(data.text));
      setPhase("done");
    } catch {
      setError("辨識失敗，請改用更清晰的照片，或改用 QR 掃描 / 人工輸入。");
      setPhase("error");
    }
  }

  const foundCount = fields ? Object.values(fields).filter(Boolean).length : 0;

  return (
    <div className="card">
      <div className="card-icon-heading">
        <span className="icon-badge">
          <ScanLine size={18} />
        </span>
        <h2>拍照辨識停車單</h2>
      </div>
      <p className="muted small">
        拍攝或選擇停車單照片，系統會在裝置上辨識文字並帶入可識別的欄位；辨識結果會在下一步供你確認與修正。
      </p>

      {preview ? (
        <div className="photo-preview-wrap">
          <img className="photo-preview" src={preview} alt="停車單照片" />
        </div>
      ) : (
        <label className="photo-drop" style={{ display: "block", cursor: "pointer" }}>
          <ImagePlus size={26} style={{ marginBottom: 8 }} />
          <div>點此拍攝或選擇停車單照片</div>
          <input type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
        </label>
      )}

      {phase === "recognizing" && (
        <div className="ocr-progress">
          <Loader2 size={15} className="spin-icon" /> 辨識中…{progress > 0 ? ` ${progress}%` : ""}
        </div>
      )}

      {error && (
        <div className="error-box">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {phase === "done" && fields && (
        <>
          <div className="info-box success">
            <CheckCircle2 size={16} />
            <span>已辨識 {foundCount} 個欄位，請於下一步確認並補齊未辨識的欄位。</span>
          </div>
          <ul className="kv-list">
            <li><span>帳單編號</span><span>{fields.ticket_no || "—"}</span></li>
            <li><span>車牌</span><span>{fields.plate_no || "—"}</span></li>
            <li><span>應繳金額</span><span>{fields.amount || "—"}</span></li>
            <li><span>停車日期</span><span>{fields.parking_date || "—"}</span></li>
            <li><span>停車時段</span><span>{fields.parking_start || "—"} ~ {fields.parking_end || "—"}</span></li>
            <li><span>行政區</span><span>{fields.district || "—"}</span></li>
            <li><span>停車地點</span><span>{fields.road || "—"}</span></li>
            <li><span>車位編號</span><span>{fields.spot_no || "—"}</span></li>
          </ul>
          <details className="ocr-raw">
            <summary>檢視辨識原始文字</summary>
            <pre className="page-preview">{rawText}</pre>
          </details>
        </>
      )}

      <div className="button-row">
        {phase === "done" && (
          <label className="btn-secondary" style={{ cursor: "pointer" }}>
            <RefreshCw size={15} /> 重新拍照
            <input type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
          </label>
        )}
        <button
          className="btn-primary"
          disabled={phase !== "done"}
          onClick={() => onResult({ status: "success", dataSource: "OCR", ticket: fields })}
        >
          使用辨識結果 <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

import { useRef, useState } from "react";
import { FileUp, Download, Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { adminApi, ApiError } from "../../api";

const IMPORT_TYPES = [
  {
    key: "locations",
    label: "停車格 / 路段",
    description: "批次新增行政區、路段、停車格編號。已存在的停車格會略過不覆寫。",
    columns: ["行政區", "路段", "停車格編號"],
  },
  {
    key: "inspectors",
    label: "稽查員帳號",
    description: "批次新增稽查員登入帳號。已存在的帳號會略過；啟用權限可填 是/否（預設為是）。",
    columns: ["帳號", "密碼", "姓名", "啟用權限（選填）"],
  },
];

function errText(err, fallback) {
  if (err instanceof ApiError) {
    if (typeof err.payload === "string") return err.payload;
  }
  return fallback;
}

export default function ImportManager() {
  const [importType, setImportType] = useState("locations");
  const [file, setFile] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  const selected = IMPORT_TYPES.find((t) => t.key === importType) ?? IMPORT_TYPES[0];

  async function handleDownloadTemplate() {
    setError("");
    setDownloading(true);
    try {
      await adminApi.downloadImportTemplate(importType);
    } catch (err) {
      setError(errText(err, "下載範本失敗，請稍後再試。"));
    } finally {
      setDownloading(false);
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) {
      setError("請先選擇 .xlsx 檔案");
      return;
    }
    setError("");
    setResult(null);
    setUploading(true);
    try {
      const res = await adminApi.importExcel(importType, file);
      setResult(res);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(errText(err, "匯入失敗，請稍後再試。"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-icon-heading">
        <span className="icon-badge">
          <FileUp size={18} />
        </span>
        <h2>資料匯入</h2>
      </div>
      <p className="muted small">
        從 Excel 批次匯入停車格或稽查員帳號。請先下載範本填寫後再上傳；匯入結果會列出成功、略過與錯誤列。
      </p>

      <div className="import-type-grid">
        {IMPORT_TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`import-type-card ${importType === t.key ? "active" : ""}`}
            onClick={() => {
              setImportType(t.key);
              setResult(null);
              setError("");
            }}
          >
            <strong>{t.label}</strong>
            <span className="muted small">{t.description}</span>
          </button>
        ))}
      </div>

      <div className="info-box import-columns">
        <strong>Excel 欄位：</strong>
        {selected.columns.join("、")}
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="import-actions">
        <button type="button" className="btn-secondary" disabled={downloading} onClick={handleDownloadTemplate}>
          {downloading ? <Loader2 size={15} className="spin-icon" /> : <Download size={15} />}
          下載 {selected.label} 範本
        </button>
      </div>

      <form onSubmit={handleUpload} className="import-upload-form">
        <label className="import-file-label">
          選擇 Excel 檔案（.xlsx）
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {file && <p className="muted small import-file-name">已選擇：{file.name}</p>}
        <button className="btn-primary" type="submit" disabled={uploading || !file}>
          {uploading ? <Loader2 size={15} className="spin-icon" /> : <Upload size={15} />}
          開始匯入
        </button>
      </form>

      {result && (
        <div className="import-result">
          <div className="import-result-summary">
            <span className="pill pill-ok">
              <CheckCircle2 size={13} /> 新增 {result.created} 筆
            </span>
            <span className="pill pill-neutral">略過 {result.skipped} 筆</span>
            <span className="pill pill-warn">
              <AlertTriangle size={13} /> 錯誤 {result.errors?.length ?? 0} 列
            </span>
            <span className="muted small">共處理 {result.total_rows} 列</span>
          </div>
          {result.errors?.length > 0 && (
            <div className="table-scroll">
              <table className="case-table">
                <thead>
                  <tr>
                    <th>列號</th>
                    <th>錯誤說明</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((rowErr) => (
                    <tr key={`${rowErr.row}-${rowErr.message}`}>
                      <td>{rowErr.row}</td>
                      <td>{rowErr.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

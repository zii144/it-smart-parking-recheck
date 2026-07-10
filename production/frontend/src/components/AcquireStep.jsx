import { useState } from "react";
import { QrCode, ScanLine } from "lucide-react";
import QRScan from "./QRScan";
import OcrCapture from "./OcrCapture";

// Step 1 of the new-case flow: get the ticket data. Two interchangeable ways —
// scan the QR code, or photograph the ticket and OCR it. Both hand back the
// same { status, dataSource, ticket } shape the 確認 step consumes.
export default function AcquireStep({ onResult, onManualFallback }) {
  const [mode, setMode] = useState("qr");

  return (
    <>
      <div className="segmented">
        <button type="button" className={mode === "qr" ? "active" : ""} onClick={() => setMode("qr")}>
          <QrCode size={14} /> 掃描 QR Code
        </button>
        <button type="button" className={mode === "ocr" ? "active" : ""} onClick={() => setMode("ocr")}>
          <ScanLine size={14} /> 拍照辨識
        </button>
      </div>
      {mode === "qr" ? (
        <QRScan onResult={onResult} onManualFallback={onManualFallback} />
      ) : (
        <OcrCapture onResult={onResult} />
      )}
    </>
  );
}

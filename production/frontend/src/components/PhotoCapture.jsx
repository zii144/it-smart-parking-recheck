import { useState } from "react";
import { Camera, ImagePlus, ArrowLeft, ArrowRight } from "lucide-react";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PhotoCapture({ onNext, onBack }) {
  const [preview, setPreview] = useState(null);
  const [base64, setBase64] = useState(null);
  const [filename, setFilename] = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToBase64(file);
    setBase64(dataUrl);
    setPreview(dataUrl);
    setFilename(file.name);
  }

  return (
    <div className="card">
      <div className="card-icon-heading">
        <span className="icon-badge">
          <Camera size={18} />
        </span>
        <h2>拍攝停車單照片作為佐證</h2>
      </div>
      <p className="muted small">選擇或拍攝一張照片作為停車單稽查佐證（原型使用檔案選取模擬拍照）。</p>

      {preview ? (
        <div className="photo-preview-wrap">
          <img className="photo-preview" src={preview} alt="停車單照片預覽" />
        </div>
      ) : (
        <label className="photo-drop" style={{ display: "block", cursor: "pointer" }}>
          <ImagePlus size={26} style={{ marginBottom: 8 }} />
          <div>點此選擇或拍攝照片</div>
          <input type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
        </label>
      )}

      {preview && (
        <label className="btn-link" style={{ cursor: "pointer" }}>
          重新選擇照片
          <input type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
        </label>
      )}

      <div className="button-row">
        <button className="btn-secondary" onClick={onBack}>
          <ArrowLeft size={15} /> 返回
        </button>
        <button className="btn-primary" disabled={!base64} onClick={() => onNext({ photo_base64: base64, photo_filename: filename })}>
          下一步：確認儲存 <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

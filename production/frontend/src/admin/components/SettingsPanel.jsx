import { useEffect, useState } from "react";
import { Settings, Save, Loader2, CheckCircle2 } from "lucide-react";
import { adminApi } from "../../api";
import Spinner from "../../components/Spinner";

export default function SettingsPanel() {
  const [threshold, setThreshold] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    adminApi.getSettings().then((s) => {
      setThreshold(String(s.overdue_threshold_minutes));
      setLoading(false);
    });
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSavedMessage(false);
    try {
      const updated = await adminApi.updateSettings({ overdue_threshold_minutes: Number(threshold) });
      setThreshold(String(updated.overdue_threshold_minutes));
      setSavedMessage(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-icon-heading">
        <span className="icon-badge">
          <Settings size={18} />
        </span>
        <h2>系統參數 / 判定規則設定</h2>
      </div>

      {loading ? (
        <Spinner label="載入中…" />
      ) : (
        <form onSubmit={handleSave}>
          <label>
            開單逾時判定門檻（分鐘）
            <input
              type="number"
              min="1"
              value={threshold}
              onChange={(e) => { setThreshold(e.target.value); setSavedMessage(false); }}
              required
            />
          </label>
          <p className="hint">
            時間差（開單時間－停車開始時間）超過此門檻即判定為「開單逾時」。此設定會立即套用到之後的判定計算，包含稽查員 APP 現場判定與後端重新計算。
          </p>

          {savedMessage && (
            <div className="info-box success">
              <CheckCircle2 size={16} />
              <span>設定已更新。</span>
            </div>
          )}

          <div className="button-row">
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? <Loader2 size={15} className="spin-icon" /> : <Save size={15} />}
              儲存設定
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

import { Wifi, WifiOff, RefreshCw, Loader2 } from "lucide-react";

export default function OfflineBar({ online, onToggle, pendingCount, onSyncNow, syncing }) {
  return (
    <div className={`offline-bar ${online ? "" : "offline"}`}>
      <label className="switch-label">
        <span className="toggle">
          <input type="checkbox" checked={online} onChange={(e) => onToggle(e.target.checked)} />
          <span className="track">
            <span className="thumb" />
          </span>
        </span>
        {online ? <Wifi size={14} /> : <WifiOff size={14} />}
        {online ? "目前有網路" : "目前離線（無網路）"}
      </label>
      {pendingCount > 0 && (
        <span className="pending-chip">
          待補傳 {pendingCount} 筆
          {online && (
            <button className="btn-link" onClick={onSyncNow} disabled={syncing}>
              {syncing ? <Loader2 size={13} className="spin-icon" /> : <RefreshCw size={13} />}
              {syncing ? "同步中…" : "立即同步"}
            </button>
          )}
        </span>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, ArrowRight } from "lucide-react";
import Spinner from "./Spinner";

// Mirrors "系統檢查帳號權限、相機、定位、網路狀態" -> "是否具備稽查權限?" in the
// activity diagram. Camera/GPS/network are simulated as always-granted in this
// prototype (documented simplification - see PROTOTYPE.md); the inspection
// permission flag is the one real, meaningful check, and it comes straight
// from the login response.
export default function PermissionCheck({ inspector, onPassed }) {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setChecking(false), 600);
    return () => clearTimeout(t);
  }, []);

  if (checking) {
    return (
      <div className="card">
        <Spinner label="系統檢查帳號權限、相機、定位、網路狀態…" />
      </div>
    );
  }

  if (!inspector.has_permission) {
    return (
      <div className="card">
        <div className="card-icon-heading">
          <span className="icon-badge" style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)" }}>
            <ShieldAlert size={18} />
          </span>
          <h2>無法繼續</h2>
        </div>
        <div className="error-box">此帳號無稽查權限，請聯繫系統管理員。</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-icon-heading">
        <span className="icon-badge">
          <ShieldCheck size={18} />
        </span>
        <h2>權限檢查通過</h2>
      </div>
      <p className="muted">歡迎，{inspector.display_name}。</p>
      <button className="btn-primary btn-block" onClick={onPassed}>
        開始稽查 <ArrowRight size={15} />
      </button>
    </div>
  );
}

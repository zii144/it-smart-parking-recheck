import { useEffect, useState } from "react";
import { ClipboardList, Inbox, Eye } from "lucide-react";
import { adminApi } from "../../api";
import Spinner from "../../components/Spinner";
import CaseDetailPanel from "./CaseDetailPanel";

const JUDGE_LABEL = {
  COMPLIANT: { text: "符合規定", cls: "pill-ok" },
  OVERDUE: { text: "開單逾時", cls: "pill-warn" },
  DATA_ERROR: { text: "資料異常", cls: "pill-error" },
  PARSE_ERROR: { text: "格式錯誤", cls: "pill-error" },
};

export default function ReviewQueue({ adminUsername }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  function load() {
    setLoading(true);
    adminApi
      .listCases({ status: "REVIEW_REQUIRED,REVIEW_NEED_INFO" })
      .then(setCases)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div className="card">
      <div className="card-icon-heading">
        <span className="icon-badge">
          <ClipboardList size={18} />
        </span>
        <h2>待複核佇列</h2>
      </div>
      <p className="muted small">開單逾時、資料異常、重複帳單、人工輸入 / 人工修正的案件會出現在這裡，等待複核。</p>

      {loading ? (
        <Spinner label="載入中…" />
      ) : cases.length === 0 ? (
        <div className="empty-state">
          <span className="icon-badge">
            <Inbox size={20} />
          </span>
          <p>目前沒有待複核案件。</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="case-table">
            <thead>
              <tr>
                <th>帳單編號</th>
                <th>地點</th>
                <th>判定</th>
                <th>狀態</th>
                <th>重複</th>
                <th>稽查員</th>
                <th>建立時間</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const judge = JUDGE_LABEL[c.judgement] ?? { text: c.judgement, cls: "pill-neutral" };
                return (
                  <tr key={c.id}>
                    <td data-label="帳單編號">{c.ticket_no}</td>
                    <td data-label="地點">{c.district} {c.road} {c.spot_no}</td>
                    <td data-label="判定"><span className={`pill ${judge.cls}`}>{judge.text}</span></td>
                    <td data-label="狀態"><span className="pill pill-warn">{c.status}</span></td>
                    <td data-label="重複">{c.duplicate_warning ? <span className="pill pill-error">是</span> : "—"}</td>
                    <td data-label="稽查員">{c.inspector_username}</td>
                    <td data-label="建立時間">{c.created_at}</td>
                    <td className="cell-action">
                      <button className="btn-secondary" onClick={() => setSelected(c)}>
                        <Eye size={13} /> 複核
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <CaseDetailPanel
          caseData={selected}
          mode="review"
          adminUsername={adminUsername}
          onClose={() => setSelected(null)}
          onReviewed={() => {
            setSelected(null);
            load();
          }}
        />
      )}
    </div>
  );
}

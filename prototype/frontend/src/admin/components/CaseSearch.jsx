import { useEffect, useState } from "react";
import { Search, Download, Inbox, Eye } from "lucide-react";
import { adminApi } from "../../api";
import Spinner from "../../components/Spinner";
import CaseDetailPanel from "./CaseDetailPanel";

const JUDGE_LABEL = {
  COMPLIANT: { text: "符合規定", cls: "pill-ok" },
  OVERDUE: { text: "開單逾時", cls: "pill-warn" },
  DATA_ERROR: { text: "資料異常", cls: "pill-error" },
  PARSE_ERROR: { text: "格式錯誤", cls: "pill-error" },
};

const STATUS_OPTIONS = ["", "REVIEW_REQUIRED", "REVIEW_NEED_INFO", "CLOSED"];
const JUDGEMENT_OPTIONS = ["", "COMPLIANT", "OVERDUE", "DATA_ERROR", "PARSE_ERROR"];

export default function CaseSearch({ adminUsername }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ status: "", judgement: "", q: "" });

  function load() {
    setLoading(true);
    adminApi.listCases(filters).then(setCases).finally(() => setLoading(false));
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(e) {
    e.preventDefault();
    load();
  }

  return (
    <div className="card">
      <div className="list-header">
        <div className="card-icon-heading" style={{ marginBottom: 0 }}>
          <span className="icon-badge">
            <Search size={18} />
          </span>
          <h2>案件查詢</h2>
        </div>
        <a className="btn-secondary" href={adminApi.exportCsvUrl()} target="_blank" rel="noreferrer">
          <Download size={15} /> 匯出 CSV
        </a>
      </div>

      <form className="filter-bar" onSubmit={handleSearch}>
        <label>
          狀態
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s || "全部"}</option>
            ))}
          </select>
        </label>
        <label>
          判定
          <select value={filters.judgement} onChange={(e) => setFilters((f) => ({ ...f, judgement: e.target.value }))}>
            {JUDGEMENT_OPTIONS.map((j) => (
              <option key={j} value={j}>{j ? (JUDGE_LABEL[j]?.text ?? j) : "全部"}</option>
            ))}
          </select>
        </label>
        <label>
          搜尋帳單編號 / 車牌
          <input value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="例如 Q702 或 ABC-1234" />
        </label>
        <button className="btn-primary" type="submit">
          <Search size={14} /> 查詢
        </button>
      </form>

      {loading ? (
        <Spinner label="載入中…" />
      ) : cases.length === 0 ? (
        <div className="empty-state">
          <span className="icon-badge">
            <Inbox size={20} />
          </span>
          <p>沒有符合條件的案件。</p>
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
                <th>來源</th>
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
                    <td>{c.ticket_no}</td>
                    <td>{c.district} {c.road} {c.spot_no}</td>
                    <td><span className={`pill ${judge.cls}`}>{judge.text}</span></td>
                    <td><span className={`pill ${c.status === "CLOSED" ? "pill-ok" : "pill-warn"}`}>{c.status}</span></td>
                    <td>{c.data_source}</td>
                    <td>{c.inspector_username}</td>
                    <td>{c.created_at}</td>
                    <td>
                      <button className="btn-secondary" onClick={() => setSelected(c)}>
                        <Eye size={13} /> 檢視
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
          mode="view"
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

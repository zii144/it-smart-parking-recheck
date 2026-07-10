import { useEffect, useState } from "react";
import { ListChecks, PlusCircle, Inbox, ImageIcon } from "lucide-react";
import { api, BASE } from "../api";
import Spinner from "./Spinner";
import { shortDateTime } from "../format";

const JUDGE_LABEL = {
  COMPLIANT: { text: "符合規定", cls: "pill-ok" },
  OVERDUE: { text: "開單逾時", cls: "pill-warn" },
  DATA_ERROR: { text: "資料異常", cls: "pill-error" },
  PARSE_ERROR: { text: "格式錯誤", cls: "pill-error" },
};

const STATUS_LABEL = {
  CLOSED: { text: "CLOSED", cls: "pill-ok" },
  REVIEW_REQUIRED: { text: "REVIEW_REQUIRED", cls: "pill-warn" },
};

function Pill({ cls, children }) {
  return <span className={`pill ${cls}`}>{children}</span>;
}

export default function CaseList({ inspector, refreshKey, onNewCase }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .listCases(inspector.username)
      .then(setCases)
      .finally(() => setLoading(false));
  }, [inspector.username, refreshKey]);

  return (
    <div className="card">
      <div className="list-header">
        <div className="card-icon-heading" style={{ marginBottom: 0 }}>
          <span className="icon-badge">
            <ListChecks size={18} />
          </span>
          <h2>我的稽查案件</h2>
        </div>
        <button className="btn-primary" onClick={onNewCase}>
          <PlusCircle size={15} /> 新增稽查案件
        </button>
      </div>

      {loading ? (
        <Spinner label="載入中…" />
      ) : cases.length === 0 ? (
        <div className="empty-state">
          <span className="icon-badge">
            <Inbox size={20} />
          </span>
          <p>尚無稽查案件，點選「新增稽查案件」開始。</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="case-table">
            <thead>
              <tr>
                <th>帳單編號</th>
                <th>地點</th>
                <th>判定</th>
                <th>需複核</th>
                <th>重複</th>
                <th>狀態</th>
                <th>來源</th>
                <th>建立時間</th>
                <th>照片</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const judge = JUDGE_LABEL[c.judgement] ?? { text: c.judgement, cls: "pill-neutral" };
                const status = STATUS_LABEL[c.status] ?? { text: c.status, cls: "pill-neutral" };
                return (
                  <tr key={c.id}>
                    <td data-label="帳單編號">{c.ticket_no}</td>
                    <td data-label="地點">
                      {c.district} {c.road} {c.spot_no}
                    </td>
                    <td data-label="判定">
                      <Pill cls={judge.cls}>{judge.text}</Pill>
                    </td>
                    <td data-label="需複核">
                      <Pill cls={c.review_required ? "pill-warn" : "pill-neutral"}>
                        {c.review_required ? "是" : "否"}
                      </Pill>
                    </td>
                    <td data-label="重複">
                      <Pill cls={c.duplicate_warning ? "pill-error" : "pill-neutral"}>
                        {c.duplicate_warning ? "是" : "否"}
                      </Pill>
                    </td>
                    <td data-label="狀態">
                      <Pill cls={status.cls}>{status.text}</Pill>
                    </td>
                    <td data-label="來源">
                      {c.data_source}
                      {c.manual_corrected ? " (已修正)" : ""}
                    </td>
                    <td data-label="建立時間">{shortDateTime(c.created_at)}</td>
                    <td data-label="照片">
                      {c.photo_path ? (
                        <a href={`${BASE}${c.photo_path}`} target="_blank" rel="noreferrer" className="btn-link" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: 0 }}>
                          <ImageIcon size={13} /> 查看
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

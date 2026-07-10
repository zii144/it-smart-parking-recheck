import { useEffect, useState } from "react";
import { ListChecks, PlusCircle, Inbox, ImageIcon } from "lucide-react";
import { api, BASE } from "../api";
import Spinner from "./Spinner";
import { shortDateTime, statusLabel, sourceLabel } from "../format";
import Pagination from "./Pagination";
import { usePagination } from "../usePagination";

const JUDGE_LABEL = {
  COMPLIANT: { text: "符合規定", cls: "pill-ok" },
  OVERDUE: { text: "開單逾時", cls: "pill-warn" },
  DATA_ERROR: { text: "資料異常", cls: "pill-error" },
  PARSE_ERROR: { text: "格式錯誤", cls: "pill-error" },
};

function Pill({ cls, children }) {
  return <span className={`pill ${cls}`}>{children}</span>;
}

export default function CaseList({ inspector, refreshKey, onNewCase }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const { page, setPage, pageSize, setPageSize, pageItems, total, pageCount } = usePagination(cases);

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
        <>
        <div className="table-scroll case-list-table">
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
              {pageItems.map((c) => {
                const judge = JUDGE_LABEL[c.judgement] ?? { text: c.judgement, cls: "pill-neutral" };
                const status = statusLabel(c.status);
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
                      {sourceLabel(c.data_source)}
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

        <ul className="case-list-cards">
          {pageItems.map((c) => {
            const judge = JUDGE_LABEL[c.judgement] ?? { text: c.judgement, cls: "pill-neutral" };
            const status = statusLabel(c.status);
            return (
              <li key={c.id} className="mcard">
                <div className="mcard-top">
                  <span className="mcard-title">{c.ticket_no}</span>
                  <Pill cls={judge.cls}>{judge.text}</Pill>
                </div>
                <div className="mcard-loc">
                  {c.district} {c.road} {c.spot_no}
                </div>
                <div className="mcard-meta">
                  <Pill cls={status.cls}>{status.text}</Pill>
                  <span className="mcard-tag">
                    {sourceLabel(c.data_source)}
                    {c.manual_corrected ? " · 已修正" : ""}
                  </span>
                  {!!c.review_required && <Pill cls="pill-warn">需複核</Pill>}
                  {!!c.duplicate_warning && <Pill cls="pill-error">重複警示</Pill>}
                </div>
                <div className="mcard-foot">
                  <span className="mcard-time">{shortDateTime(c.created_at)}</span>
                  {c.photo_path ? (
                    <a href={`${BASE}${c.photo_path}`} target="_blank" rel="noreferrer" className="btn-link" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: 0 }}>
                      <ImageIcon size={13} /> 查看照片
                    </a>
                  ) : (
                    <span className="mcard-time">無照片</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <Pagination
          page={page} pageSize={pageSize} total={total} pageCount={pageCount}
          onPage={setPage} onPageSize={setPageSize}
        />
        </>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Search, Download, Inbox, Eye, AlertCircle, Loader2 } from "lucide-react";
import { adminApi } from "../../api";
import Spinner from "../../components/Spinner";
import CaseDetailPanel from "./CaseDetailPanel";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../usePagination";
import { shortDateTime, sourceLabel } from "../../format";

export default function CaseSearch({ adminUsername }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ district: "", inspector: "", date: "", q: "" });
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const { page, setPage, pageSize, setPageSize, pageItems, total, pageCount } = usePagination(cases);

  function load() {
    setLoading(true);
    setLoadError(false);
    adminApi
      .listCases(filters)
      .then((rows) => setCases(rows ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDownloadCsv() {
    setDownloadError("");
    setDownloading(true);
    try {
      await adminApi.downloadCsv();
    } catch {
      // Previously an unhandled rejection with no feedback if the export failed.
      setDownloadError("匯出失敗，請稍後再試。");
    } finally {
      setDownloading(false);
    }
  }

  // Autocomplete suggestions from whatever is currently loaded.
  const districtOptions = useMemo(
    () => [...new Set(cases.map((c) => c.district).filter(Boolean))].sort(),
    [cases]
  );
  const inspectorOptions = useMemo(
    () => [...new Set(cases.map((c) => c.inspector_username).filter(Boolean))].sort(),
    [cases]
  );

  const setField = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

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
        <button className="btn-secondary" type="button" onClick={handleDownloadCsv} disabled={downloading}>
          {downloading ? <Loader2 size={15} className="spin-icon" /> : <Download size={15} />} 匯出 CSV
        </button>
      </div>
      {downloadError && <div className="error-box">{downloadError}</div>}

      <form className="filter-bar" onSubmit={handleSearch}>
        <label>
          行政區
          <input list="filter-districts" value={filters.district} onChange={setField("district")} placeholder="全部" />
          <datalist id="filter-districts">
            {districtOptions.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
        <label>
          稽查員
          <input list="filter-inspectors" value={filters.inspector} onChange={setField("inspector")} placeholder="全部" />
          <datalist id="filter-inspectors">
            {inspectorOptions.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </label>
        <label>
          日期
          <input type="date" value={filters.date} onChange={setField("date")} />
        </label>
        <label>
          搜尋帳單編號 / 車牌
          <input value={filters.q} onChange={setField("q")} placeholder="例如 Q702 或 ABC-1234" />
        </label>
        <button className="btn-primary" type="submit">
          <Search size={14} /> 查詢
        </button>
      </form>

      {loading ? (
        <Spinner label="載入中…" />
      ) : loadError ? (
        <div className="empty-state">
          <span className="icon-badge">
            <AlertCircle size={20} />
          </span>
          <p>載入案件失敗，請確認網路連線後重試。</p>
        </div>
      ) : cases.length === 0 ? (
        <div className="empty-state">
          <span className="icon-badge">
            <Inbox size={20} />
          </span>
          <p>沒有符合條件的案件。</p>
        </div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="case-table">
              <thead>
                <tr>
                  <th>帳單編號</th>
                  <th>地點</th>
                  <th>來源</th>
                  <th>稽查員</th>
                  <th>建立時間</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((c) => (
                  <tr key={c.id}>
                    <td data-label="帳單編號">{c.ticket_no}</td>
                    <td data-label="地點">{c.district} {c.road} {c.spot_no}</td>
                    <td data-label="來源">{sourceLabel(c.data_source)}</td>
                    <td data-label="稽查員">{c.inspector_username}</td>
                    <td data-label="建立時間">{shortDateTime(c.created_at)}</td>
                    <td className="cell-action">
                      <button className="btn-secondary" onClick={() => setSelected(c)}>
                        <Eye size={13} /> 檢視
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page} pageSize={pageSize} total={total} pageCount={pageCount}
            onPage={setPage} onPageSize={setPageSize}
          />
        </>
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

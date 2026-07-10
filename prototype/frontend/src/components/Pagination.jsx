import { ChevronLeft, ChevronRight } from "lucide-react";

const DEFAULT_SIZES = [10, 25, 50, 100];

// Pagination footer: a page-size selector ("每頁 N 筆"), a range/total readout,
// and prev/next navigation. Hidden when there are fewer rows than the smallest
// page size (nothing to paginate).
export default function Pagination({ page, pageSize, total, pageCount, onPage, onPageSize, sizes = DEFAULT_SIZES }) {
  if (total <= sizes[0]) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="pagination">
      <div className="pagination-left">
        <label className="pagination-size">
          每頁
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
            {sizes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          筆
        </label>
        <span className="pagination-info">第 {from}–{to} 筆，共 {total} 筆</span>
      </div>
      <div className="pagination-nav">
        <button className="btn-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={15} /> 上一頁
        </button>
        <span className="pagination-page">{page} / {pageCount}</span>
        <button className="btn-secondary" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          下一頁 <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

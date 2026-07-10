import { useEffect, useMemo, useState } from "react";

// Client-side pagination over an already-loaded array. Returns the current
// page's slice plus the state/handlers a <Pagination> control needs. A new
// data set (e.g. a fresh search) resets back to the first page.
export function usePagination(items, initialSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [items]);

  // Keep the page in range if pageSize shrinks the number of pages.
  const clampedPage = Math.min(page, pageCount);

  const pageItems = useMemo(
    () => items.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [items, clampedPage, pageSize]
  );

  function changePageSize(size) {
    setPageSize(size);
    setPage(1);
  }

  return {
    page: clampedPage,
    setPage,
    pageSize,
    setPageSize: changePageSize,
    pageItems,
    total,
    pageCount,
  };
}

// Compact, wrap-friendly datetime for tables: "2026-07-09T17:02:34" ->
// "2026-07-09 17:02". The space lets a narrow column wrap the time onto a
// second line instead of forcing the whole table to scroll horizontally.
export function shortDateTime(v) {
  if (!v) return "—";
  const s = String(v).replace("T", " ");
  return s.length >= 16 ? s.slice(0, 16) : s;
}

// Human-readable zh-TW case status, with the pill colour to use for it.
const STATUS_META = {
  REVIEW_REQUIRED: { text: "待複核", cls: "pill-warn" },
  REVIEW_NEED_INFO: { text: "需補充資料", cls: "pill-warn" },
  CLOSED: { text: "已結案", cls: "pill-ok" },
};

export function statusLabel(status) {
  return STATUS_META[status] ?? { text: status, cls: "pill-neutral" };
}

// Plain code -> zh-TW text map (for chart labels etc.).
export const STATUS_TEXT = Object.fromEntries(
  Object.entries(STATUS_META).map(([k, v]) => [k, v.text])
);

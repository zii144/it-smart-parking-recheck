// Compact, wrap-friendly datetime for tables: "2026-07-09T17:02:34" ->
// "2026-07-09 17:02". The space lets a narrow column wrap the time onto a
// second line instead of forcing the whole table to scroll horizontally.
export function shortDateTime(v) {
  if (!v) return "—";
  const s = String(v).replace("T", " ");
  return s.length >= 16 ? s.slice(0, 16) : s;
}

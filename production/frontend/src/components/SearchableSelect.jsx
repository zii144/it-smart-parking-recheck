import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, Check } from "lucide-react";

// A type-to-filter dropdown that stays usable when the option list grows large
// (districts / roads seeded later can be hundreds long). Falls back gracefully
// to a plain click list when the query is empty.
export default function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "請選擇…",
  disabled = false,
  searchPlaceholder = "輸入關鍵字篩選…",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // Reset + focus the filter each time it opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  function pick(opt) {
    onChange(opt);
    setOpen(false);
  }

  return (
    <div className="field">
      {label && <span className="field-label">{label}</span>}
      <div className="combo" ref={rootRef}>
        <button
          type="button"
          className="combo-control"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => !disabled && setOpen((v) => !v)}
        >
          <span className={value ? "" : "combo-placeholder"}>{value || placeholder}</span>
          <ChevronDown size={16} className={`combo-chevron ${open ? "is-open" : ""}`} />
        </button>

        {open && (
          <div className="combo-panel" role="listbox">
            <div className="combo-search">
              <Search size={14} />
              <input
                ref={inputRef}
                value={query}
                placeholder={searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  if (e.key === "Enter" && filtered.length > 0) {
                    e.preventDefault();
                    pick(filtered[0]);
                  }
                }}
              />
            </div>
            <ul className="combo-list">
              {filtered.length === 0 ? (
                <li className="combo-empty">查無「{query}」</li>
              ) : (
                filtered.map((opt) => (
                  <li key={opt}>
                    <button
                      type="button"
                      className={`combo-option ${opt === value ? "is-selected" : ""}`}
                      onClick={() => pick(opt)}
                    >
                      <span>{opt}</span>
                      {opt === value && <Check size={14} />}
                    </button>
                  </li>
                ))
              )}
            </ul>
            {options.length > 12 && (
              <div className="combo-count">
                顯示 {filtered.length} / {options.length} 筆
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

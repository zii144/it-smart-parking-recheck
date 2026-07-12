import { ClipboardList, Wifi, WifiOff } from "lucide-react";
import { sourceLabel } from "../format";

const JUDGEMENT_LABELS = {
  COMPLIANT: "符合規定",
  OVERDUE: "開單逾時",
  DATA_ERROR: "資料異常",
  PARSE_ERROR: "格式錯誤",
};

// Desktop-only running summary of the case being built — fills in as the
// inspector moves through the wizard, so the accumulated data stays visible
// beside whichever step is active. Values fall back to the best source
// available before a step has been confirmed (e.g. the scanned ticket before
// the 確認 step writes draft.fields).
export default function DraftSummary({ draft, online }) {
  const fields = draft.fields || {};
  const ticket = draft.scanResult?.ticket || {};
  const location = [draft.district, draft.road, draft.spot_no].filter(Boolean).join(" ");
  const judgement = draft.judgmentPreview?.judgement;

  const rows = [
    { label: "稽查地點", value: location },
    { label: "帳單編號", value: fields.ticket_no || ticket.ticket_no },
    { label: "車牌號碼", value: fields.plate_no || ticket.plate_no },
    {
      label: "資料來源",
      value: draft.scanResult ? sourceLabel(draft.scanResult.dataSource) : null,
    },
    {
      label: "開單判定",
      value: judgement ? (JUDGEMENT_LABELS[judgement] || judgement) : null,
      accent: judgement && judgement !== "COMPLIANT" ? "warn" : judgement ? "ok" : null,
    },
  ];

  return (
    <aside className="draft-summary" aria-label="案件草稿摘要">
      <div className="draft-summary-head">
        <ClipboardList size={15} />
        <span>案件草稿</span>
      </div>
      <dl className="draft-summary-list">
        {rows.map((r) => (
          <div key={r.label} className="draft-row">
            <dt>{r.label}</dt>
            <dd className={r.value ? (r.accent ? `val-${r.accent}` : "") : "is-empty"}>
              {r.value || "—"}
            </dd>
          </div>
        ))}
      </dl>
      <div className={`draft-net ${online ? "on" : "off"}`}>
        {online ? <Wifi size={13} /> : <WifiOff size={13} />}
        {online ? "已連線，將即時上傳" : "離線，將本機暫存"}
      </div>
    </aside>
  );
}
